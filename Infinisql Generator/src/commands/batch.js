/**
 * 批量处理命令模块
 * 
 * 处理 --batch, --all, --ids-file 等批量处理命令
 */

const fs = require('fs')
const path = require('path')
const { CONFIG, ROOT_DIR } = require('../config')
const { loadDatasourceConfig } = require('../config/datasource')
const appState = require('../state')
const { loadProgress, saveProgress, getTestedIds, displayTaskTimes, recordTaskTime } = require('../handlers/progress')
const websocket = require('../services/websocket')
const { handleServerMessage } = require('../handlers/message')
const { processTask } = require('../handlers/task')
const { readJSONL } = require('../utils/file')
const { formatDuration, delay } = require('../utils/format')

/**
 * 批量处理任务
 * @param {string} token - JWT Token
 * @param {Object} options - 选项
 * @param {number} options.start - 起始索引
 * @param {number} options.count - 处理数量
 * @param {boolean} options.skipTested - 是否跳过已测试
 * @param {string|null} options.idsFile - 从文件读取 instance_id 列表（每行一个），只处理这些题
 * @param {boolean} options.resume - 从上次中断处继续（跳过 progress.completed）
 * @param {number|null} options.randomCount - 随机选择 n 个未测试问题并依次处理（与第一版 --random-count 一致）
 */
async function runBatch(token, options = {}) {
  const { start = 0, count = 10, skipTested = true, idsFile = null, resume = false, randomCount = null } = options
  
  // 加载问题列表与进度（resume/random 需要 progress）
  console.log('\n📂 加载问题列表...')
  const items = await readJSONL(CONFIG.inputFile)
  console.log(`  找到 ${items.length} 个问题`)
  const progress = loadProgress()
  
  let itemsToProcess
  if (idsFile) {
    // 与 --one 一致：相对路径以项目根目录(ROOT_DIR)为基准，不依赖 process.cwd()，任意目录下执行都能找到文件
    const idsPath = path.isAbsolute(idsFile) ? idsFile : path.resolve(ROOT_DIR, idsFile)
    if (!fs.existsSync(idsPath)) {
      console.error('--ids-file 文件不存在: ' + idsPath)
      return
    }
    const raw = fs.readFileSync(idsPath, 'utf8')
    const ids = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    const itemMap = new Map(items.map(i => [i.instance_id, i]))
    itemsToProcess = ids.map(id => itemMap.get(id)).filter(Boolean)
    const missing = ids.filter(id => !itemMap.has(id))
    if (missing.length) {
      console.log('⚠️ 以下 id 在 jsonl 中未找到，已跳过: ' + missing.join(', '))
    }
    console.log(`📋 从 --ids-file 加载 ${ids.length} 个 id，将处理 ${itemsToProcess.length} 个问题`)
  } else {
    const testedIds = getTestedIds()
    console.log(`  已测试: ${testedIds.size} 个`)
    let base = items
    if (resume) {
      const completedSet = new Set(progress.completed || [])
      base = base.filter(item => !completedSet.has(item.instance_id))
      console.log(`  --resume: 过滤后 ${base.length} 个待处理`)
    }
    if (randomCount != null && randomCount > 0) {
      base = base.filter(item => !testedIds.has(item.instance_id))
      console.log(`\n🎲 随机模式：已过滤已测试问题，剩余 ${base.length} 个待选`)
      if (base.length === 0) {
        console.log('\n❌ 没有可用的未测试问题')
        return
      }
      if (base.length < randomCount) {
        console.log(`\n⚠️ 可用问题数量 (${base.length}) 少于请求数量 (${randomCount})，将处理所有可用问题`)
      }
      for (let i = base.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[base[i], base[j]] = [base[j], base[i]]
      }
      itemsToProcess = base.slice(0, Math.min(randomCount, base.length))
      console.log(`\n✅ 已随机选择 ${itemsToProcess.length} 个问题：`)
      itemsToProcess.forEach((item, idx) => {
        console.log(`   ${idx + 1}. ${item.instance_id}`)
      })
    } else {
      if (skipTested) {
        base = base.filter(item => !testedIds.has(item.instance_id))
        console.log(`  待处理: ${base.length} 个`)
      }
      const maxCount = count > 0 ? count : base.length
      const endIndex = Math.min(start + maxCount, base.length)
      itemsToProcess = base.slice(start, endIndex)
      console.log(`\n📋 将处理 ${itemsToProcess.length} 个问题 (索引 ${start} - ${endIndex - 1})`)
    }
  }
  
  if (itemsToProcess.length === 0) {
    console.log('\n✅ 没有需要处理的问题')
    return
  }
  
  // 加载数据源配置
  appState.datasourceConfigMap = loadDatasourceConfig()
  
  if (progress.datasourceMap) {
    appState.datasourceIdMap = progress.datasourceMap
  }
  
  // 初始化统计
  appState.stats = {
    total: itemsToProcess.length,
    processed: 0,
    success: 0,
    failed: 0,
    startTime: Date.now(),
  }
  
  // 设置处理状态
  appState.isProcessing = true
  
  // 数据源：与第一版完全一致——仅从 progress 恢复映射，不在开头集中创建；缺的由 processTask 内按任务按需创建（避免短时间多发创建请求导致 Server busy）
  const neededDbIds = [...new Set(itemsToProcess.map(i => i.db_id))]
  const configuredDs = neededDbIds.filter(dbId => appState.datasourceIdMap[dbId] && appState.datasourceIdMap[dbId] !== 'EXISTS')
  const unconfiguredDs = neededDbIds.filter(dbId => !appState.datasourceIdMap[dbId] || appState.datasourceIdMap[dbId] === 'EXISTS')
  
  if (neededDbIds.length > 0) {
    console.log(`\n📊 涉及 ${neededDbIds.length} 个数据源: ${neededDbIds.join(', ')}`)
    if (configuredDs.length > 0) console.log(`  ✓ 已配置: ${configuredDs.join(', ')}`)
    if (unconfiguredDs.length > 0) {
      console.log(`  ✗ 未配置: ${unconfiguredDs.join(', ')}`)
      console.log(`\n💡 未配置的数据源将在处理到对应任务时按需自动创建（与第一版一致）`)
    }
  }
  
  // 初始化 WebSocket
  console.log('\n🔌 连接 WebSocket...')
  websocket.setMessageHandler(handleServerMessage)
  await websocket.initSocket(token)
  
  // 处理任务
  console.log('\n' + '═'.repeat(60))
  console.log('开始批量处理')
  console.log('═'.repeat(60))
  
  for (const item of itemsToProcess) {
    appState.stats.processed++
    
    try {
      await processTask(item, progress, token)
    } catch (error) {
      console.error(`处理 ${item.instance_id} 时出错:`, error.message)
      progress.failed.push(item.instance_id)
      recordTaskTime(progress, item.instance_id, 0, 'error')
      saveProgress(progress)
      appState.stats.failed++
    }
    
    // 任务间延迟
    if (appState.stats.processed < appState.stats.total) {
      const taskDelay = CONFIG.taskDelay || CONFIG.requestDelay || 5000
      console.log(`\n等待 ${taskDelay / 1000} 秒后处理下一个...`)
      await delay(taskDelay)
    }
  }
  
  // 完成
  appState.isProcessing = false
  websocket.disconnect()
  
  // 显示统计
  const totalDuration = Date.now() - appState.stats.startTime
  console.log('\n' + '═'.repeat(60))
  console.log('批量处理完成')
  console.log('═'.repeat(60))
  console.log(`  总数: ${appState.stats.total}`)
  console.log(`  成功: ${appState.stats.success}`)
  console.log(`  失败: ${appState.stats.failed}`)
  console.log(`  总耗时: ${formatDuration(totalDuration)}`)
  console.log(`  平均耗时: ${formatDuration(totalDuration / appState.stats.total)}`)
  
  // 显示任务时间统计
  displayTaskTimes(progress)
}

/**
 * 处理所有未测试的问题
 * @param {string} token - JWT Token
 */
async function runAll(token) {
  await runBatch(token, { start: 0, count: Infinity, skipTested: true })
}

/**
 * 处理指定范围的问题
 * @param {string} token - JWT Token
 * @param {number} start - 起始索引
 * @param {number} end - 结束索引
 */
async function runRange(token, start, end) {
  await runBatch(token, { start, count: end - start, skipTested: false })
}

/**
 * 处理指定的单个问题
 * @param {string} token - JWT Token
 * @param {string} instanceId - 实例 ID
 */
async function runSingle(token, instanceId) {
  // 加载问题列表
  const items = await readJSONL(CONFIG.inputFile)
  const item = items.find(i => i.instance_id === instanceId)
  
  if (!item) {
    console.error(`错误: 未找到问题 ${instanceId}`)
    process.exit(1)
  }
  
  // 加载数据源配置
  appState.datasourceConfigMap = loadDatasourceConfig()
  
  // 加载进度
  const progress = loadProgress()
  if (progress.datasourceMap) {
    appState.datasourceIdMap = progress.datasourceMap
  }
  
  // 初始化统计
  appState.stats = {
    total: 1,
    processed: 0,
    success: 0,
    failed: 0,
    startTime: Date.now(),
  }
  
  // 初始化 WebSocket
  console.log('\n🔌 连接 WebSocket...')
  websocket.setMessageHandler(handleServerMessage)
  await websocket.initSocket(token)
  
  // 处理任务
  appState.stats.processed++
  try {
    await processTask(item, progress, token)
  } catch (error) {
    console.error(`处理 ${item.instance_id} 时出错:`, error.message)
  }
  
  // 完成
  websocket.disconnect()
}

module.exports = {
  runBatch,
  runAll,
  runRange,
  runSingle,
}
