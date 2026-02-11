/**
 * 任务处理模块
 * 
 * 管理 SQL 生成任务的处理流程：
 * - 提示词构建
 * - 单问题查询
 * - 批量任务处理
 */

const { CONFIG } = require('../config')
const { loadDatasourceConfig } = require('../config/datasource')
const appState = require('../state')
const { extractFiles } = require('../utils/file')
const { formatDuration, delay } = require('../utils/format')
const { saveProgress, getTestedIds, recordTaskTime } = require('./progress')
const { ensureDatasourceForBatch } = require('../services/datasource')
const { ensureKnowledgeForBatch } = require('../services/knowledgebase')
const websocket = require('../services/websocket')

/**
 * 解析数据源名称，提取 database 和 schema
 * @param {string} dsName - 数据源名称
 * @returns {Object|null} { database, schema }
 */
function parseDatasourceName(dsName) {
  if (!dsName) return null
  const parts = dsName.split('_')
  
  // 处理重复格式：如 DEPS_DEV_V1_DEPS_DEV_V1
  if (parts.length >= 4) {
    for (let i = 1; i < parts.length; i++) {
      const firstPart = parts.slice(0, i).join('_')
      const secondPart = parts.slice(i).join('_')
      if (firstPart === secondPart) {
        return { database: firstPart, schema: firstPart }
      }
    }
  }
  
  // 处理 DATABASE_SCHEMA 格式
  if (parts.length >= 2) {
    const mid = Math.floor(parts.length / 2)
    const database = parts.slice(0, mid).join('_')
    const schema = parts.slice(mid).join('_')
    return { database, schema }
  }
  
  return { database: dsName, schema: dsName }
}

/**
 * 构建 SQL 生成提示词
 * @param {Object} item - 问题项
 * @returns {string} 提示词
 */
function buildPrompt(item) {
  const instanceId = item.instance_id
  
  const datasourceNames = []
  const config = appState.datasourceConfigMap[instanceId]
  if (config && config.names && config.names.length) {
    datasourceNames.push(...config.names)
  } else if (config && config.name) {
    datasourceNames.push(config.name)
  } else if (item.db_id) {
    datasourceNames.push(item.db_id)
  }
  if (item.db_ids && Array.isArray(item.db_ids)) {
    datasourceNames.length = 0
    for (const dbId of item.db_ids) {
      let found = false
      for (const [id, cfg] of Object.entries(appState.datasourceConfigMap)) {
        if (cfg.original_db_id === dbId) {
          datasourceNames.push(cfg.name)
          found = true
          break
        }
      }
      if (!found) {
        datasourceNames.push(dbId)
      }
    }
  }
  
  // 去重
  const uniqueDatasourceNames = [...new Set(datasourceNames)]
  
  // 构建数据源连接名称字符串（单数据源一行，多数据源逗号分隔）
  let datasourceInfo = ''
  if (uniqueDatasourceNames.length === 0) {
    datasourceInfo = '数据源连接名称：未指定'
  } else {
    datasourceInfo = `数据源连接名称：${uniqueDatasourceNames.join(', ')}`
  }
  
  // 通用模板：instanceId + 数据源 + 问题 + 生成两个文件说明
  const prompt = `${instanceId}
${datasourceInfo}
${item.instruction}

生成两个文件：
1. CSV 文件 (${instanceId}.csv): 问题答案
2. SQL 文件 (${instanceId}.sql): 完整的sql语句
`
  
  return prompt
}

/**
 * 单问题查询
 * @param {Object} item - 问题项
 * @param {string} token - JWT Token
 * @returns {Promise<void>}
 */
async function queryOne(item, token) {
  const instanceId = item.instance_id
  const isTested = getTestedIds().has(instanceId)
  
  console.log(`\n📋 已选择: ${instanceId} ${isTested ? '✅' : ''}`)
  console.log(`   数据源: ${item.db_id}`)
  
  // 确保数据源配置已加载
  if (Object.keys(appState.datasourceConfigMap).length === 0) {
    appState.datasourceConfigMap = loadDatasourceConfig()
  }
  
  // 自动配置数据源
  console.log(`\n🔍 检查数据源配置...`)
  const dsReady = await ensureDatasource(token, item)
  if (!dsReady) {
    console.log(`\n❌ 数据源配置失败，无法继续查询`)
    return { completed: false }
  }
  
  console.log(`\n问题: ${item.instruction}`)
  console.log('')
  
  const prompt = buildPrompt(item)
  
  console.log('🚀 发送查询到 AI Gateway...')
  
  // 发送任务
  const response = await websocket.sendTaskSimple(prompt, CONFIG.websocketWaitTimeout)
  
  // 处理响应
  let responseText = ''
  let isIncomplete = false
  
  if (typeof response === 'string') {
    responseText = response
  } else if (response && typeof response === 'object') {
    if (response.incomplete) {
      isIncomplete = true
      responseText = response.response || ''
    } else {
      responseText = response.fullResponse || response.text || ''
    }
  }
  
  const files = extractFiles(responseText)
  
  if (appState.hasCompletionResult && !isIncomplete) {
    console.log(`\n✅ 任务已完成（已收到完成消息）`)
    if (files.sql) {
      console.log(`  📄 SQL: ${files.sql.length} 字符（未保存，请手动从 Web 端复制）`)
    } else {
      console.log(`  ⚠️ 未提取到 SQL 内容，请从 Web 端手动复制`)
    }
    if (files.csv) {
      console.log(`  📄 CSV: ${files.csv.length} 字符（未保存，请手动从 Web 端复制）`)
    } else {
      console.log(`  ⚠️ 未提取到 CSV 内容，请从 Web 端手动复制`)
    }
    appState.hasCompletionResult = false
    return { completed: true }
  }
  
  if (isIncomplete || (!files.sql && !files.csv)) {
    console.log(`\n⚠️ WebSocket 未返回完整响应`)
    if (appState.currentTaskId) {
      console.log(`   任务 ID: ${appState.currentTaskId}`)
      console.log(`   请检查 Web 端任务状态，或稍后重试`)
    }
  } else {
    console.log(`\n✓ WebSocket 已确认任务完成`)
  }
  
  if (files.sql) {
    console.log(`\n📄 提取到 SQL: ${files.sql.length} 字符（未保存，请手动从 Web 端复制）`)
  } else {
    console.log('\n⚠️ 未能提取 SQL')
  }
  
  if (files.csv) {
    console.log(`📄 提取到 CSV: ${files.csv.length} 字符（未保存，请手动从 Web 端复制）`)
  }
  
  console.log('\n' + '═'.repeat(48))
  return { completed: false }
}

/**
 * 确保数据源存在（用于单问题查询）
 * @param {string} token - JWT Token
 * @param {Object} item - 问题项
 * @returns {Promise<boolean>} 是否成功
 */
async function ensureDatasource(token, item) {
  const instanceId = item.instance_id
  
  const configMap = loadDatasourceConfig()
  appState.datasourceConfigMap = configMap
  const config = configMap[instanceId]
  
  if (!config) {
    console.log(`  ⚠️ 未找到问题 ${instanceId} 的数据源配置`)
    return false
  }
  
  const datasourceName = config.name
  const dbName = config.original_db_id
  
  // 检查本地映射
  if (appState.datasourceIdMap[datasourceName] && appState.datasourceIdMap[datasourceName] !== 'EXISTS') {
    console.log(`  ✓ 数据源 "${datasourceName}" 已在本地映射中，跳过创建`)
    return true
  }
  
  if (appState.datasourceIdMap[dbName] && appState.datasourceIdMap[dbName] !== 'EXISTS') {
    console.log(`  ✓ 数据源 "${dbName}" 已在本地映射中（向后兼容），跳过创建`)
    appState.datasourceIdMap[datasourceName] = appState.datasourceIdMap[dbName]
    return true
  }
  
  // 创建数据源
  console.log(`  🔧 正在创建数据源 "${datasourceName}"...`)
  const { createDatasource } = require('../services/datasource')
  const dsId = await createDatasource(token, config)
  
  if (dsId && dsId !== 'EXISTS') {
    appState.datasourceIdMap[datasourceName] = dsId
    appState.datasourceIdMap[dbName] = dsId
    saveProgress({ completed: [], failed: [], datasourceMap: appState.datasourceIdMap })
    console.log(`  ✓ 数据源创建成功`)
    return true
  } else if (dsId === 'EXISTS') {
    appState.datasourceIdMap[datasourceName] = 'EXISTS'
    appState.datasourceIdMap[dbName] = 'EXISTS'
    saveProgress({ completed: [], failed: [], datasourceMap: appState.datasourceIdMap })
    console.log(`  ⚠️ 数据源已存在，使用已有配置`)
    return true
  }
  
  console.log(`  ✗ 数据源创建失败`)
  return false
}

/**
 * 处理批量任务中的单个任务
 * @param {Object} item - 问题项
 * @param {Object} progress - 进度对象
 * @param {string} token - JWT Token
 * @returns {Promise<Object>} { success, duration }
 */
async function processTask(item, progress, token) {
  const instanceId = item.instance_id
  const taskStartTime = Date.now()
  
  const config = appState.datasourceConfigMap[instanceId]
  const datasourceName = config ? config.original_db_id : item.db_id
  // 该题实际需要确保存在的数据源名称列表：
  // - 多 schema：config.names = ["DB_SCHEMA1","DB_SCHEMA2",...]
  // - 单 schema：config.name = "DB_SCHEMA" 或 "DB"
  // - 兜底：datasourceName（db_id）
  const requiredDatasourceNames = (config && Array.isArray(config.names) && config.names.length > 0)
    ? config.names
    : (config && config.name ? [config.name] : (datasourceName ? [datasourceName] : []))
  
  console.log(`[${appState.stats.processed + 1}/${appState.stats.total}] ${instanceId}`)
  console.log(`数据源: ${datasourceName}`)
  console.log(`问题: ${item.instruction.substring(0, 60)}...`)
  console.log(`⏰ 开始时间: ${new Date().toLocaleString('zh-CN')}`)
  
  // 检查数据源
  const missingDatasourceNames = requiredDatasourceNames.filter((dn) => !appState.datasourceIdMap[dn] || appState.datasourceIdMap[dn] === 'EXISTS')
  if (missingDatasourceNames.length > 0) {
    console.log(`  ⚠️ 检测到缺失数据源 (${missingDatasourceNames.length}个): ${missingDatasourceNames.join(', ')}`)
    console.log(`  🔧 自动创建/补齐中...`)
    const ensureKey = (config && config.original_db_id) ? config.original_db_id : datasourceName
    const dsReady = await ensureDatasourceForBatch(token, instanceId, ensureKey)
    if (!dsReady) {
      const taskDuration = Date.now() - taskStartTime
      console.log(`  ⏱️ 任务耗时: ${formatDuration(taskDuration)}`)
      progress.failed.push(instanceId)
      recordTaskTime(progress, instanceId, taskDuration, 'failed')
      saveProgress(progress)
      appState.stats.failed++
      return { success: false, duration: taskDuration }
    }
  }

  // 检查/自动创建知识库（如果该题有 external_knowledge）
  await ensureKnowledgeForBatch(token, item)
  
  // 检查 WebSocket 连接
  if (!websocket.isConnected()) {
    console.log(`  🔄 WebSocket 已断开，正在重新连接...`)
    const reconnected = await websocket.reconnectSocket(token)
    if (reconnected) {
      console.log(`  ✓ 重连成功`)
      await delay(500)
    } else {
      console.log(`  ⚠️ 重连失败，任务状态未知`)
    }
  }
  
  // 确保配置已加载
  if (Object.keys(appState.datasourceConfigMap).length === 0) {
    appState.datasourceConfigMap = loadDatasourceConfig()
  }
  
  // 发送任务
  const response = await websocket.sendTask(item, buildPrompt)
  console.log('')
  
  // 情况0: 如果已收到完成消息（hasCompletionResult = true），直接认为任务已完成
  // 因为 Web 端已经发送了 completion_result，说明任务已经完成
  if (appState.hasCompletionResult) {
    console.log(`\n✅ 任务已完成（已收到 completion_result 消息）`)
    // 尝试提取文件（如果有）
    let files = { sql: '', csv: '' }
    if (response && typeof response === 'string') {
      files = extractFiles(response)
    } else if (response && typeof response === 'object' && response.fullResponse) {
      files = extractFiles(response.fullResponse)
    }
    
    if (files.sql) {
      const sqlContent = typeof files.sql === 'string' ? files.sql : String(files.sql)
      console.log(`  📄 SQL: ${sqlContent.length} 字符（未保存，请手动从 Web 端复制）`)
    }
    if (files.csv) {
      const csvContent = typeof files.csv === 'string' ? files.csv : String(files.csv)
      console.log(`  📄 CSV: ${csvContent.length} 字符（未保存，请手动从 Web 端复制）`)
    }
    
    // 重置标志
    appState.hasCompletionResult = false
    const taskDuration = Date.now() - taskStartTime
    console.log(`  ⏱️ 任务耗时: ${formatDuration(taskDuration)}`)
    progress.completed.push(instanceId)
    recordTaskTime(progress, instanceId, taskDuration, 'success')
    saveProgress(progress)
    appState.stats.success++
    return { success: true, confirmedByCompletionMessage: true, duration: taskDuration }
  }
  
  // 情况1: WebSocket 返回了完整响应（有 SQL 或 CSV），任务已完成
  if (response && response.sql) {
    // 任务已完成，标记为成功
    const sqlContent = typeof response.sql === 'string' ? response.sql : String(response.sql)
    console.log(`  📄 提取到 SQL: ${sqlContent.length} 字符（未保存，请手动从 Web 端复制）`)
    
    if (response.csv) {
      const csvContent = typeof response.csv === 'string' ? response.csv : String(response.csv)
      console.log(`  📄 提取到 CSV: ${csvContent.length} 字符（未保存，请手动从 Web 端复制）`)
    } else {
      console.log(`  ⚠️ 未提取到 CSV 内容`)
    }
    
    const taskDuration = Date.now() - taskStartTime
    console.log(`  ⏱️ 任务耗时: ${formatDuration(taskDuration)}`)
    progress.completed.push(instanceId)
    recordTaskTime(progress, instanceId, taskDuration, 'success')
    saveProgress(progress)
    appState.stats.success++
    return { success: true, duration: taskDuration }
  }
  
  // 情况2: WebSocket 返回了响应但内容不完整，或连接断开
  if (response && (response.incomplete || !response.sql || response.disconnected)) {
    if (response.disconnected) {
      console.log(`\n⚠️ WebSocket 连接断开，任务状态未知`)
    } else {
      console.log(`\n⚠️ WebSocket 未返回完整响应，任务状态未知`)
    }
    // 如果连接断开，尝试重连后继续
    if (response.disconnected && !websocket.isConnected()) {
      console.log(`  🔄 尝试重新连接...`)
      const reconnected = await websocket.reconnectSocket(token)
      if (reconnected) {
        console.log(`  ✓ 重连成功，但任务状态未知，标记为不完整`)
      }
    }
    // 标记为不完整，继续处理下一个任务
    const taskDuration = Date.now() - taskStartTime
    console.log(`  ⏱️ 任务耗时: ${formatDuration(taskDuration)}`)
    recordTaskTime(progress, instanceId, taskDuration, 'incomplete')
    saveProgress(progress)
    appState.stats.failed++
    return { success: false, incomplete: true, duration: taskDuration }
  }
  
  // 情况3: 未收到任何响应，可能是连接断开导致
  if (!response) {
    console.log(`  ⚠️ 未收到响应`)
    // 如果没有 task_id，说明任务可能未发送成功，但不重试（避免创建重复任务）
    if (!appState.currentTaskId) {
      console.log(`  ⚠️ 未获取到 task_id，任务可能未发送成功，跳过此任务（避免创建重复任务）`)
      const taskDuration = Date.now() - taskStartTime
      recordTaskTime(progress, instanceId, taskDuration, 'skipped')
      saveProgress(progress)
      appState.stats.failed++
      return { success: false, skipped: true, duration: taskDuration }
    }
    // 如果有 task_id 但未收到响应，标记为不完整
    console.log(`  ⚠️ 任务已发送但未收到响应，标记为不完整`)
    const taskDuration = Date.now() - taskStartTime
    console.log(`  ⏱️ 任务耗时: ${formatDuration(taskDuration)}`)
    recordTaskTime(progress, instanceId, taskDuration, 'incomplete')
    saveProgress(progress)
    appState.stats.failed++
    return { success: false, incomplete: true, duration: taskDuration }
  }
  
  // 情况4: 检查是否是不完整响应（超时但未收到 completion_result）
  if (response && response.incomplete) {
    if (response.disconnected) {
      console.log(`  ⚠️ 连接断开，任务未完成，继续下一个问题`)
    } else {
      console.log(`  ⚠️ 内容不完整（超时），不保存文件，标记为 incomplete`)
    }
    // 不保存文件，不标记为完成或失败
    // 任务会在重试时重新处理（使用 --resume）
    // 但继续处理下一个问题，不阻塞批量处理
    const taskDuration = Date.now() - taskStartTime
    recordTaskTime(progress, instanceId, taskDuration, 'incomplete')
    saveProgress(progress)
    appState.stats.failed++
    return { success: false, incomplete: true, duration: taskDuration }
  }
  
  // 尝试提取文件（最后的手段）
  let files = { sql: '', csv: '' }
  if (response && typeof response === 'string') {
    files = extractFiles(response)
  } else if (response && typeof response === 'object') {
    files = response.sql || response.csv ? response : extractFiles(response.fullResponse || '')
  }
  
  if (files.sql || files.csv) {
    console.log(`  ✓ 任务完成`)
    if (files.sql) {
      const sqlContent = typeof files.sql === 'string' ? files.sql : String(files.sql)
      console.log(`  📄 SQL: ${sqlContent.length} 字符（未保存，请手动从 Web 端复制）`)
    }
    if (files.csv) {
      const csvContent = typeof files.csv === 'string' ? files.csv : String(files.csv)
      console.log(`  📄 CSV: ${csvContent.length} 字符（未保存，请手动从 Web 端复制）`)
    }
    const taskDuration = Date.now() - taskStartTime
    console.log(`  ⏱️ 任务耗时: ${formatDuration(taskDuration)}`)
    progress.completed.push(instanceId)
    recordTaskTime(progress, instanceId, taskDuration, 'success')
    saveProgress(progress)
    appState.stats.success++
    return { success: true, duration: taskDuration }
  }
  
  // 其他情况：标记为失败
  console.log(`  ✗ 未知错误，标记为失败`)
  const taskDuration = Date.now() - taskStartTime
  console.log(`  ⏱️ 任务耗时: ${formatDuration(taskDuration)}`)
  progress.failed.push(instanceId)
  recordTaskTime(progress, instanceId, taskDuration, 'failed')
  saveProgress(progress)
  appState.stats.failed++
  return { success: false, duration: taskDuration }
}

module.exports = {
  buildPrompt,
  parseDatasourceName,
  queryOne,
  ensureDatasource,
  processTask,
}
