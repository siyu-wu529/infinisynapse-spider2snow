/**
 * 设置命令模块
 * 
 * 处理 --setup, --setup-kb, --create-ds, --create-kb 等设置命令
 */

const fs = require('fs')
const { CONFIG } = require('../config')
const { loadDatasourceConfig, generateDatasourceConfigTemplate } = require('../config/datasource')
const { setupDatasources, createDatasource, listDatasources, getDatasourceIdByName } = require('../services/datasource')
const { createKnowledge, setupAllKnowledgeBases, uploadToKnowledge } = require('../services/knowledgebase')
const { loadProgress, saveProgress, saveKnowledgeMap } = require('../handlers/progress')
const appState = require('../state')
const path = require('path')
const { ROOT_DIR } = require('../config')

/**
 * 设置所有数据源
 * @param {string} token - JWT Token
 * @returns {Promise<void>}
 */
async function setupAllDatasources(token) {
  console.log('\n🔧 开始设置数据源...')
  
  // 自动清理数据源映射
  console.log('🗑️ 清理本地数据源映射...')
  appState.datasourceIdMap = {}
  const savedProgress = loadProgress()
  savedProgress.datasourceMap = {}
  fs.writeFileSync(CONFIG.progressFile, JSON.stringify(savedProgress, null, 2))
  console.log('  ✓ 已清理 progress.json 中的数据源映射\n')
  
  const newDatasourceMap = await setupDatasources(token)
  
  // 保存数据源映射
  if (Object.keys(newDatasourceMap).length > 0) {
    appState.datasourceIdMap = newDatasourceMap
    saveProgress({ completed: [], failed: [], datasourceMap: newDatasourceMap })
    console.log('\n✓ 数据源设置完成，已保存到 progress.json')
  }
}

/**
 * 创建单个数据源
 * @param {string} token - JWT Token
 * @param {string} instanceId - 实例 ID
 * @returns {Promise<void>}
 */
async function createSingleDatasource(token, instanceId) {
  if (!instanceId) {
    console.error('错误: 请指定 instance_id')
    console.log('  用法: node src/cli.js --create-ds <instance_id>')
    process.exit(1)
  }
  
  const configMap = loadDatasourceConfig()
  const config = configMap[instanceId]
  
  if (!config) {
    console.error(`错误: 未找到 ${instanceId} 的数据源配置`)
    console.log('  请检查 snowflake_database_setting.json 文件')
    process.exit(1)
  }
  
  console.log(`\n🔧 创建数据源: ${instanceId}`)
  console.log(`  数据库: ${config.original_db_id}`)
  console.log(`  Schema: ${config.main_schema || 'PUBLIC'}`)
  
  const dsId = await createDatasource(token, config)
  
  if (dsId && dsId !== 'EXISTS') {
    const savedProgress = loadProgress()
    savedProgress.datasourceMap = savedProgress.datasourceMap || {}
    // 与第一版一致：同时保存 config.name 与 original_db_id，便于后续按 db_id 或按名称查找
    savedProgress.datasourceMap[config.name] = dsId
    savedProgress.datasourceMap[config.original_db_id] = dsId
    fs.writeFileSync(CONFIG.progressFile, JSON.stringify(savedProgress, null, 2))
    appState.datasourceIdMap[config.name] = dsId
    appState.datasourceIdMap[config.original_db_id] = dsId
    console.log(`\n✓ 数据源创建成功，已保存到 progress.json`)
  } else if (dsId === 'EXISTS') {
    const existingId = await getDatasourceIdByName(token, config.name)
    if (existingId) {
      const savedProgress = loadProgress()
      savedProgress.datasourceMap = savedProgress.datasourceMap || {}
      savedProgress.datasourceMap[config.name] = existingId
      savedProgress.datasourceMap[config.original_db_id] = existingId
      fs.writeFileSync(CONFIG.progressFile, JSON.stringify(savedProgress, null, 2))
      console.log(`\n⚠️ 数据源已存在，已解析并保存 ID: ${existingId}`)
    } else {
      console.log(`\n⚠️ 数据源已存在`)
    }
  } else {
    console.log(`\n❌ 数据源创建失败`)
  }
}

/**
 * 从 ids-file 批量创建数据源（不跑任务、不连 WebSocket）
 * @param {string} token - JWT Token
 * @param {string} idsFile - instance_id 列表文件（每行一个）
 * @returns {Promise<void>}
 */
async function createDatasourcesFromIdsFile(token, idsFile) {
  if (!idsFile) {
    console.error('错误: 请指定 --ids-file <path>')
    process.exit(1)
  }

  const fs = require('fs')
  const idsPath = path.isAbsolute(idsFile) ? idsFile : path.resolve(ROOT_DIR, idsFile)
  if (!fs.existsSync(idsPath)) {
    console.error('--ids-file 文件不存在: ' + idsPath)
    process.exit(1)
  }

  const raw = fs.readFileSync(idsPath, 'utf8')
  const ids = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) {
    console.log('✅ ids-file 为空，无需创建数据源')
    return
  }

  // 加载配置与进度映射
  const configMap = loadDatasourceConfig()
  const progress = loadProgress()
  if (progress.datasourceMap) {
    appState.datasourceIdMap = progress.datasourceMap
  }

  // 初始化统计（用于 saveProgress 写 stats）
  appState.stats = { total: ids.length, processed: 0, success: 0, failed: 0, startTime: Date.now() }

  const { ensureDatasourceForBatch } = require('../services/datasource')

  console.log(`\n🔧 将为 ids-file 中 ${ids.length} 个问题创建/补齐数据源（多 schema 会创建多个）`)
  console.log(`   ids-file: ${idsPath}\n`)

  for (let i = 0; i < ids.length; i++) {
    const instanceId = ids[i]
    appState.stats.processed = i + 1

    const cfg = configMap[instanceId]
    if (!cfg) {
      console.log(`[${i + 1}/${ids.length}] ${instanceId}  ❌ 未找到数据源配置，跳过`)
      appState.stats.failed++
      continue
    }

    console.log(`[${i + 1}/${ids.length}] ${instanceId}`)
    console.log(`  数据库: ${cfg.original_db_id}`)
    if (cfg.names && cfg.names.length) {
      console.log(`  期望数据源(${cfg.names.length}): ${cfg.names.join(', ')}`)
    } else {
      console.log(`  期望数据源: ${cfg.name || cfg.original_db_id}`)
    }

    const ok = await ensureDatasourceForBatch(token, instanceId, cfg.original_db_id)
    if (ok) {
      appState.stats.success++
      console.log('  ✓ 已创建/补齐')
    } else {
      appState.stats.failed++
      console.log('  ❌ 创建/补齐失败')
    }

    // 持久化映射到 progress.json
    saveProgress(progress)
  }

  console.log(`\n✅ 数据源批量创建完成：成功 ${appState.stats.success}，失败 ${appState.stats.failed}`)
  console.log(`   已写入: ${require('../config').CONFIG.progressFile}`)
}

/**
 * 设置所有知识库
 * @param {string} token - JWT Token
 * @returns {Promise<void>}
 */
async function setupAllKnowledgeBasesCmd(token) {
  console.log('\n🚀 开始创建所有知识库...')
  
  // 自动清理知识库映射
  console.log('🗑️ 清理本地知识库映射...')
  saveKnowledgeMap({})
  console.log('  ✓ 已清理 knowledge_map.json 中的知识库映射\n')
  
  // 加载数据源映射
  const savedProgress = loadProgress()
  if (savedProgress.datasourceMap) {
    appState.datasourceIdMap = savedProgress.datasourceMap
  }
  
  await setupAllKnowledgeBases(token)
}

/**
 * 创建单个知识库
 * @param {string} token - JWT Token
 * @param {string} instanceId - 实例 ID
 * @returns {Promise<void>}
 */
async function createSingleKnowledgeBase(token, instanceId) {
  if (!instanceId) {
    console.error('错误: 请指定 instance_id')
    console.log('  用法: node src/cli.js --create-kb <instance_id>')
    process.exit(1)
  }
  
  // 加载数据源映射
  const savedProgress = loadProgress()
  if (savedProgress.datasourceMap) {
    appState.datasourceIdMap = savedProgress.datasourceMap
  }
  
  await createKnowledge(token, instanceId)
}

/**
 * 上传文件到现有知识库（与第一版 --upload-kb 一致）
 * @param {string} token - JWT Token
 * @param {string} kbId - 知识库 ID
 * @param {string} mdFilename - md 文件名（在 docsDir 下）
 * @returns {Promise<boolean>} 是否成功
 */
async function uploadToKnowledgeBase(token, kbId, mdFilename) {
  if (!kbId || !mdFilename) {
    console.error('错误: 请指定知识库 ID 和文件名')
    console.log('  用法: node src/cli.js --upload-kb <kb_id> <filename>')
    process.exit(1)
  }
  const success = await uploadToKnowledge(token, kbId, mdFilename)
  if (success) {
    console.log('\n✅ 上传成功')
  } else {
    console.log('\n❌ 上传失败')
  }
  return success
}

/**
 * 列出所有数据源
 * @param {string} token - JWT Token
 * @returns {Promise<void>}
 */
async function listAllDatasources(token) {
  await listDatasources(token)
}

/**
 * 显示数据源配置模板
 */
function showDatasourceConfig() {
  generateDatasourceConfigTemplate()
}

/**
 * 重置数据源映射
 */
function resetDatasourceMap() {
  console.log('\n🗑️ 清理数据源映射...')
  appState.datasourceIdMap = {}
  const savedProgress = loadProgress()
  savedProgress.datasourceMap = {}
  fs.writeFileSync(CONFIG.progressFile, JSON.stringify(savedProgress, null, 2))
  console.log('  ✓ 已清理 progress.json 中的数据源映射')
}

/**
 * 重置所有本地映射
 */
function resetAllMappings() {
  console.log('\n🗑️ 清理所有本地映射...')
  
  // 清理数据源映射
  appState.datasourceIdMap = {}
  const savedProgress = loadProgress()
  savedProgress.datasourceMap = {}
  fs.writeFileSync(CONFIG.progressFile, JSON.stringify(savedProgress, null, 2))
  console.log('  ✓ 已清理 progress.json 中的数据源映射')
  
  // 清理知识库映射
  saveKnowledgeMap({})
  console.log('  ✓ 已清理 knowledge_map.json 中的知识库映射')
  
  console.log('\n✅ 所有本地映射已清理完成！')
  console.log('   现在可以重新创建数据源和知识库（Token 从项目根 .env 的 AI_GATEWAY_TOKEN 读取）：')
  console.log('   1. node src/cli.js --setup')
  console.log('   2. node src/cli.js --setup-kb')
}

module.exports = {
  setupAllDatasources,
  createSingleDatasource,
  createDatasourcesFromIdsFile,
  setupAllKnowledgeBasesCmd,
  createSingleKnowledgeBase,
  uploadToKnowledgeBase,
  listAllDatasources,
  showDatasourceConfig,
  resetDatasourceMap,
  resetAllMappings,
}
