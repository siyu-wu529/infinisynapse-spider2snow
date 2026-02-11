/**
 * 数据源服务模块
 * 
 * 管理 AI Gateway 中的数据源：创建、查询、批量设置
 */

const { CONFIG } = require('../config')
const { loadDatasourceConfig, generateDatasourceConfigTemplate, getUniqueDatasources } = require('../config/datasource')
const { httpRequest } = require('../utils/http')
const { delay } = require('../utils/format')
const appState = require('../state')
const { DatasourceError } = require('../errors')

/**
 * 通过名称获取数据源 ID
 * @param {string} token - JWT Token
 * @param {string} datasourceName - 数据源名称
 * @returns {Promise<string|null>} 数据源 ID
 */
async function getDatasourceIdByName(token, datasourceName) {
  try {
    const response = await httpRequest(`${CONFIG.apiUrl}/v1/datasources`, token)
    
    if (response.html || !response.data) {
      return null
    }
    
    // 1. 首先尝试精确匹配（与第一版一致）
    const exactMatch = response.data.find(d => d.name === datasourceName)
    if (exactMatch && exactMatch.id) {
      return exactMatch.id
    }
    
    // 2. 精确匹配失败时，尝试前缀匹配（与第一版一致）
    // 例如：ETHEREUM_BLOCKCHAIN 匹配 ETHEREUM_BLOCKCHAIN_ETHEREUM_BLOCKCHAIN
    const prefixMatches = response.data.filter(d => d.name && d.name.startsWith(datasourceName + '_'))
    if (prefixMatches.length > 0) {
      const match = prefixMatches[0]
      if (match.id) {
        console.log(`  ℹ️ 前缀匹配: "${datasourceName}" -> "${match.name}"`)
        return match.id
      }
    }
    
    return null
  } catch (error) {
    console.error(`  查询数据源 ID 失败: ${error.message}`)
    return null
  }
}

/**
 * 创建数据源
 * @param {string} token - JWT Token
 * @param {Object} config - 数据源配置
 * @returns {Promise<string|null>} 数据源 ID 或 'EXISTS' 或 null
 */
async function createDatasource(token, config) {
  try {
    console.log(`\n📌 创建数据源: ${config.name}`)
    
    // 若调用方已传入 main_schema / name（多 schema 逐项创建时），直接使用
    let mainSchema = config.main_schema
    if (mainSchema === undefined || mainSchema === '') {
      if (Array.isArray(config.schema)) {
        const starSchema = config.schema.find(s => s && String(s).includes('*'))
        mainSchema = starSchema ? String(starSchema).replace(/\*/g, '').trim() : (config.schema[0] || 'PUBLIC')
      } else if (config.schema?.includes('*')) {
        mainSchema = String(config.schema).replace(/\*/g, '').trim()
      } else {
        mainSchema = 'PUBLIC'
      }
    }
    const schemaStr = mainSchema
    const databaseStr = config.original_db_id || config.name
    const datasourceName = (config.name != null && config.name !== '') ? config.name : `${config.original_db_id}_${schemaStr}`
    
    // 描述中说明数据库名和 schema 名
    const datasourceDesc = config.description 
      ? `${config.description}。数据库名: ${databaseStr}, Schema: ${schemaStr}`
      : `数据库: ${databaseStr}, Schema: ${schemaStr}`
    
    const body = {
      name: datasourceName,
      description: datasourceDesc,
      type: 'snowflake',
      enabled: 1,
      rag_names: [],
      config: JSON.stringify({
        snowflake_host: config.host,
        snowflake_username: config.username,
        snowflake_password: config.password,
        snowflake_database: databaseStr,
        snowflake_schema: schemaStr,
        deep_optimization: true,
      }),
    }
    
    console.log(`  发送请求...`)
    const isRetryable = (r) => (r && (r.code === 500 || r.status === 500) && (r.message || '').toLowerCase().includes('busy'))
    let response = await httpRequest(CONFIG.datasourceApi, token, 'POST', body)
    let attempts = 1
    const maxAttempts = 3
    while (isRetryable(response) && attempts < maxAttempts) {
      const waitMs = 3000 * attempts
      console.log(`  ⚠️ Server is busy，${waitMs / 1000}s 后重试 (${attempts}/${maxAttempts - 1})...`)
      await delay(waitMs)
      response = await httpRequest(CONFIG.datasourceApi, token, 'POST', body)
      attempts++
    }
    
    // 检测重复名称错误
    if (response.code === 1509 && response.message?.includes('duplicate name')) {
      console.log(`  ⚠️ 数据源已存在，查询 ID...`)
      const existingId = await getDatasourceIdByName(token, datasourceName)
      if (existingId) {
        console.log(`  ✓ 获取到已有数据源 ID: ${existingId}`)
        return existingId
      }
      return 'EXISTS'
    }
    
    if (response.html || response.code === 404 || response.status === 404) {
      console.log(`  ⚠️ API 返回错误`)
      return null
    }
    
    if (response.id || response.data?.id || response.data?.insertedId) {
      const dsId = response.id || response.data?.id || response.data?.insertedId
      console.log(`  ✓ 数据源创建成功，ID: ${dsId}`)
      return dsId
    }
    
    console.log(`  ⚠️ 响应: ${JSON.stringify(response).substring(0, 100)}`)
    return null
  } catch (error) {
    console.error(`  ✗ 创建失败: ${error.message}`)
    return null
  }
}

/**
 * 批量设置数据源
 * @param {string} token - JWT Token
 * @returns {Promise<Object>} 数据源映射 { name: id }
 */
async function setupDatasources(token) {
  const configMap = loadDatasourceConfig()
  
  // 收集所有需要创建的数据源（支持多 schema：每个带 * 的 schema 都创建一个数据源）
  const uniqueDsMap = {}
  for (const instanceId of Object.keys(configMap)) {
    const config = configMap[instanceId]
    const schemasToCreate = (config.main_schemas && config.main_schemas.length)
      ? config.main_schemas
      : (config.main_schema ? [config.main_schema] : [])
    
    if (schemasToCreate.length === 0 && config.name) {
      // 无 * schema 时，使用 config.name（可能是 dbId 或 dbId_schema）
      const key = config.name
      if (!uniqueDsMap[key]) {
        uniqueDsMap[key] = { config, schemaName: null, datasourceName: key }
      }
    } else {
      // 为每个 schema 创建一个数据源
      for (const schemaName of schemasToCreate) {
        const datasourceName = `${config.original_db_id}_${schemaName}`
        if (!uniqueDsMap[datasourceName]) {
          uniqueDsMap[datasourceName] = { config, schemaName, datasourceName }
        }
      }
    }
  }
  
  const datasourceKeys = Object.keys(uniqueDsMap)
  
  if (datasourceKeys.length === 0) {
    console.log('没有需要创建的数据源配置')
    return {}
  }
  
  console.log(`\n📊 准备创建 ${datasourceKeys.length} 个数据源...`)
  console.log('（按 dbId + schema 组合去重，支持多 schema 题目，每次运行都会重新创建并更新 progress.json）')
  
  const newDatasourceMap = {}
  let created = 0
  let exists = 0
  
  for (const datasourceKey of datasourceKeys) {
    const { config, schemaName, datasourceName } = uniqueDsMap[datasourceKey]
    const dbName = config.original_db_id
    const finalSchemaName = schemaName || config.main_schema || 'PUBLIC'
    const finalDatasourceName = datasourceName || config.name
    
    console.log(`  目标: ${finalDatasourceName} (数据库: ${dbName}, Schema: ${finalSchemaName})`)
    const cfg = schemaName ? { ...config, main_schema: schemaName, name: finalDatasourceName } : config
    const dsId = await createDatasource(token, cfg)
    
    if (dsId === 'EXISTS') {
      console.log(`  ⚠️ ${finalDatasourceName} 已存在`)
      exists++
      const existingId = await getDatasourceIdByName(token, finalDatasourceName)
      if (existingId) {
        newDatasourceMap[finalDatasourceName] = existingId
        console.log(`  ✓ 获取到已有数据源 ID: ${existingId}`)
      }
    } else if (dsId) {
      newDatasourceMap[finalDatasourceName] = dsId
      // 仅当单 schema 时，也保存到 dbName（向后兼容）
      if (!schemaName || (config.main_schemas && config.main_schemas.length === 1)) {
        newDatasourceMap[dbName] = dsId
      }
      created++
      console.log(`  ✓ ${finalDatasourceName} 创建成功`)
    } else {
      console.log(`  ⚠️ ${finalDatasourceName} 创建失败`)
    }
    
    await delay(500)
  }
  
  console.log(`\n📈 数据源设置完成: ${created} 个新建, ${exists} 个已存在`)
  return newDatasourceMap
}

/**
 * 列出所有数据源
 * @param {string} token - JWT Token
 * @returns {Promise<Object[]>} 数据源列表
 */
async function listDatasources(token) {
  try {
    const response = await httpRequest(`${CONFIG.apiUrl}/v1/datasources`, token)
    
    if (response.html) {
      console.log('\n⚠️ HTTP API 不可用（需要管理员权限或特殊角色）')
      console.log('💡 请在 AI Gateway 控制台中手动管理数据源')
      generateDatasourceConfigTemplate()
      return []
    }
    
    if (response.data) {
      console.log('\n可用数据源:')
      console.log('─'.repeat(60))
      response.data.forEach(ds => {
        console.log(`ID: ${ds.id}`)
        console.log(`  名称: ${ds.name}`)
        console.log(`  类型: ${ds.type}`)
        console.log(`  状态: ${ds.status}`)
        console.log('─'.repeat(60))
      })
    }
    return response.data || []
  } catch (error) {
    console.error('获取数据源列表失败:', error.message)
    generateDatasourceConfigTemplate()
    return []
  }
}

/**
 * 确保数据源存在（用于批量处理）
 * @param {string} token - JWT Token
 * @param {string} instanceId - 实例 ID
 * @param {string} dbId - 数据库 ID
 * @returns {Promise<boolean>} 是否成功
 */
async function ensureDatasourceForBatch(token, instanceId, dbId) {
  const configMap = loadDatasourceConfig()
  Object.assign(appState.datasourceConfigMap, configMap)
  const config = configMap[instanceId]
  if (!config) return false

  const dbNameOnly = dbId
  const schemasToEnsure = (config.main_schemas && config.main_schemas.length)
    ? config.main_schemas
    : (config.main_schema ? [config.main_schema] : [])
  if (schemasToEnsure.length === 0 && config.name) {
    const dn = config.name
    if (appState.datasourceIdMap[dn] && appState.datasourceIdMap[dn] !== 'EXISTS') return true
    if (appState.datasourceIdMap[dbNameOnly] && appState.datasourceIdMap[dbNameOnly] !== 'EXISTS') {
      appState.datasourceIdMap[dn] = appState.datasourceIdMap[dbNameOnly]
      return true
    }
    console.log(`  🔧 正在创建数据源 "${dn}" (数据库: ${dbNameOnly})...`)
    const dsId = await createDatasource(token, config)
    if (dsId && dsId !== 'EXISTS') {
      appState.datasourceIdMap[dn] = dsId
      appState.datasourceIdMap[dbNameOnly] = dsId
      console.log(`  ✓ 数据源创建成功`)
      return true
    }
    if (dsId === 'EXISTS') {
      const existingId = await getDatasourceIdByName(token, dn)
      if (existingId) {
        appState.datasourceIdMap[dn] = existingId
        appState.datasourceIdMap[dbNameOnly] = existingId
        return true
      }
      appState.datasourceIdMap[dn] = 'EXISTS'
      appState.datasourceIdMap[dbNameOnly] = 'EXISTS'
      return true
    }
    console.log(`  ✗ 数据源 "${dn}" 创建失败`)
    return false
  }

  for (let idx = 0; idx < schemasToEnsure.length; idx++) {
    const schemaName = schemasToEnsure[idx]
    const datasourceName = `${dbNameOnly}_${schemaName}`

    if (appState.datasourceIdMap[datasourceName] && appState.datasourceIdMap[datasourceName] !== 'EXISTS') {
      if (idx > 0) await delay(500)
      continue
    }
    if (appState.datasourceIdMap[dbNameOnly] && appState.datasourceIdMap[dbNameOnly] !== 'EXISTS' && schemaName === (config.main_schema || schemasToEnsure[0])) {
      appState.datasourceIdMap[datasourceName] = appState.datasourceIdMap[dbNameOnly]
      if (idx > 0) await delay(500)
      continue
    }
    if (idx > 0) await delay(500)

    console.log(`  🔧 正在创建数据源 "${datasourceName}" (数据库: ${dbNameOnly}, Schema: ${schemaName})...`)
    const cfg = { ...config, main_schema: schemaName, name: datasourceName }
    const dsId = await createDatasource(token, cfg)

    if (dsId && dsId !== 'EXISTS') {
      appState.datasourceIdMap[datasourceName] = dsId
      if (schemasToEnsure.length === 1) appState.datasourceIdMap[dbNameOnly] = dsId
      console.log(`  ✓ 数据源创建成功`)
    } else if (dsId === 'EXISTS') {
      const existingId = await getDatasourceIdByName(token, datasourceName)
      if (existingId) {
        appState.datasourceIdMap[datasourceName] = existingId
        if (schemasToEnsure.length === 1) appState.datasourceIdMap[dbNameOnly] = existingId
        console.log(`  ✓ 获取到已有数据源 ID: ${existingId}`)
      } else {
        appState.datasourceIdMap[datasourceName] = 'EXISTS'
        if (schemasToEnsure.length === 1) appState.datasourceIdMap[dbNameOnly] = 'EXISTS'
      }
    } else {
      console.log(`  ✗ 数据源 "${datasourceName}" 创建失败`)
      return false
    }
    if (idx < schemasToEnsure.length - 1) await delay(500)
  }
  return true
}

module.exports = {
  getDatasourceIdByName,
  createDatasource,
  setupDatasources,
  listDatasources,
  ensureDatasourceForBatch,
}
