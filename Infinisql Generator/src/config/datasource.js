/**
 * 数据源配置加载模块
 * 
 * 管理 Snowflake 数据源配置
 */

const fs = require('fs')
const path = require('path')
const { CONFIG } = require('./index')
const { loadCredentials, mergeCredentials } = require('./credentials')

/**
 * 按主机地址匹配凭证（当 setting 未提供 host_prefix 时兜底）
 * @param {Object} credentials - 凭证对象（key -> {host, username, password, ...}）
 * @param {string} host - 主机地址，如 xxx.snowflakecomputing.com
 * @returns {Object|null} { prefix, host, username, password, ... } 或 null
 */
function getCredentialsByHost(credentials, host) {
  if (!credentials || !host) return null
  const hostLower = String(host).toLowerCase()
  const matches = Object.entries(credentials).filter(([_, cred]) => {
    const h = cred && cred.host ? String(cred.host).toLowerCase() : ''
    return h === hostLower
  })
  if (matches.length === 1) {
    const [prefix, cred] = matches[0]
    return { prefix, ...cred }
  }
  return null
}

/**
 * 加载数据源配置（与第一版一致：优先 CONFIG，否则尝试 cwd 下的文件名）
 * @param {string} filePath - 配置文件路径（可选）
 * @returns {Object} 数据源配置映射 (instanceId -> config)
 */
function loadDatasourceConfig(filePath = null) {
  let configFile = filePath || CONFIG.datasourceConfigFile
  if (!fs.existsSync(configFile)) {
    const cwdFile = path.resolve(process.cwd(), 'snowflake_database_setting.json')
    if (cwdFile !== configFile && fs.existsSync(cwdFile)) {
      configFile = cwdFile
    } else {
      console.warn(`⚠️ 数据源配置文件不存在: ${configFile}`)
      return {}
    }
  }
  
  // 加载凭证文件
  const credentials = loadCredentials()
  const credentialEntries = Object.entries(credentials || {})
  
  try {
    const data = JSON.parse(fs.readFileSync(configFile, 'utf8'))
    
    // 按 instance_id 生成配置
    const configMap = {}
    
    for (const item of data) {
      const instanceId = item['instance_id']
      const dbId = item['数据源']
      if (!instanceId || !dbId) continue
      
      // 获取凭证信息
      let host = item['主机地址']
      let username = item['用户名']
      let password = item['password']
      
      // 尝试从凭证文件获取敏感信息：
      // 1) 优先使用 host_prefix
      // 2) 若没有 host_prefix，则按主机地址匹配
      // 3) 若凭证文件只有一条记录，且 host 为空或匹配，也可兜底使用（避免全量 setting 必须写 host_prefix）
      if (item['host_prefix'] && credentials[item['host_prefix']]) {
        const cred = credentials[item['host_prefix']]
        host = cred.host || host
        username = cred.username || username
        password = cred.password || password
      } else {
        const matched = getCredentialsByHost(credentials, host)
        if (matched) {
          host = matched.host || host
          username = matched.username || username
          password = matched.password || password
        } else if (credentialEntries.length === 1) {
          const [onlyPrefix, onlyCred] = credentialEntries[0]
          const onlyHost = onlyCred && onlyCred.host ? String(onlyCred.host).toLowerCase() : ''
          if (!host || onlyHost === String(host).toLowerCase()) {
            host = onlyCred.host || host
            username = onlyCred.username || username
            password = onlyCred.password || password
          }
        }
      }
      
      // 保留原始 schema 数组（包含带 * 的）
      const originalSchema = Array.isArray(item['schema']) ? item['schema'] : []
      
      // 提取所有带 * 的 schema（如一题涉及 GITHUB_REPOS *、MONTH * 则两个都要）
      const mainSchemas = Array.isArray(originalSchema)
        ? originalSchema.filter(s => s && String(s).includes('*')).map(s => String(s).replace(/\*/g, '').trim()).filter(Boolean)
        : []
      const mainSchema = mainSchemas[0] || ''
      const datasourceName = mainSchema ? `${dbId}_${mainSchema}` : dbId
      const datasourceNames = mainSchemas.length ? mainSchemas.map(s => `${dbId}_${s}`) : [datasourceName]
      
      const originalDesc = item['数据源描述'] || dbId
      configMap[instanceId] = {
        name: datasourceName,
        names: datasourceNames,
        main_schema: mainSchema,
        main_schemas: mainSchemas,
        description: originalDesc,
        type: item['数据源类型'] || 'Snowflake',
        host: host,
        username: username,
        password: password,
        schema: originalSchema,
        instance_id: instanceId,
        original_db_id: dbId,
      }
    }
    
    return configMap
  } catch (error) {
    console.error(`加载数据源配置失败: ${error.message}`)
    return {}
  }
}

/**
 * 生成数据源配置模板（用于手动创建）
 * @param {Object} configMap - 数据源配置映射
 */
function generateDatasourceConfigTemplate(configMap = null) {
  const config = configMap || loadDatasourceConfig()
  
  // 按 db_id 分组去重
  const uniqueDbMap = {}
  for (const instanceId of Object.keys(config)) {
    const cfg = config[instanceId]
    const dbId = cfg.original_db_id
    if (!uniqueDbMap[dbId]) {
      uniqueDbMap[dbId] = cfg
    }
  }
  
  const dbIds = Object.keys(uniqueDbMap)
  
  console.log('\n📋 数据源配置模板（请在 AI Gateway 控制台手动创建）:')
  console.log('═'.repeat(60))
  
  for (const dbId of dbIds) {
    const cfg = uniqueDbMap[dbId]
    console.log(`\n【数据源名称】: ${dbId}`)
    console.log(`【描述】: ${cfg.description}`)
    console.log(`【类型】: ${cfg.type}`)
    console.log(`【主机】: ${cfg.host}`)
    console.log(`【用户名】: ${cfg.username}`)
    console.log(`【Schema】: ${cfg.schema}`)
    console.log('-'.repeat(60))
  }
  
  console.log('\n💡 请在 AI Gateway 控制台中手动创建以上数据源，')
  console.log('   然后运行 --list-ds 获取数据源 ID 并更新配置。')
}

/**
 * 获取唯一的数据源配置（按名称去重）
 * @param {Object} configMap - 数据源配置映射
 * @returns {Object} 去重后的数据源配置
 */
function getUniqueDatasources(configMap = null) {
  const config = configMap || loadDatasourceConfig()
  
  const uniqueMap = {}
  for (const instanceId of Object.keys(config)) {
    const cfg = config[instanceId]
    const key = cfg.name
    if (!uniqueMap[key]) {
      uniqueMap[key] = cfg
    }
  }
  
  return uniqueMap
}

module.exports = {
  loadDatasourceConfig,
  generateDatasourceConfigTemplate,
  getUniqueDatasources,
}
