/**
 * 主配置模块
 * 
 * 统一管理所有配置项，支持多环境配置
 */

const path = require('path')

// 获取项目根目录（src 的上一级）
const ROOT_DIR = path.resolve(__dirname, '../..')

/**
 * 默认配置
 */
const defaultConfig = {
  // API 配置
  socketUrl: 'https://app.infinisynapse.cn/ai_gateway',
  apiUrl: 'https://app.infinisynapse.cn',
  datasourceApi: 'https://app.infinisynapse.cn/api/ai_database/add',
  knowledgeCreateApi: '/api/ai_rag_sdk/create',
  uploadApiPrefix: '/api/tools/upload',
  
  // 文件路径配置（相对于项目根目录）
  inputFile: path.join(ROOT_DIR, '../Spider2/spider2-snow/spider2-snow.jsonl'),
  datasourceConfigFile: path.join(ROOT_DIR, 'snowflake_database_setting.json'),
  credentialsFile: path.join(ROOT_DIR, 'snowflake_credentials.json'),
  outputDirSql: path.join(ROOT_DIR, 'output/sql'),
  outputDirCsv: path.join(ROOT_DIR, 'output/csv'),
  progressFile: path.join(ROOT_DIR, 'data/progress.json'),
  knowledgeMapFile: path.join(ROOT_DIR, 'data/knowledge_map.json'),
  logFile: path.join(ROOT_DIR, 'data/error.log'),
  docsDir: path.join(ROOT_DIR, '../Spider2/spider2-snow/resource/documents'),
  
  // 功能开关
  enableFileWrite: false,
  
  // 超时配置
  timeout: 1800000,              // 30 分钟超时
  requestDelay: 5000,            // 5 秒间隔
  taskDelay: 5000,               // 任务间延迟（批量处理时使用）
  websocketWaitTimeout: 1200000, // WebSocket 等待超时（20分钟）
  
  // WebSocket 配置
  socketOptions: {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 60000,
    withCredentials: true,
    timeout: 30000,
  },
  
  // 心跳和进度保存
  heartbeatInterval: 30000,
  progressSaveInterval: 60000,
  
  // 重试配置
  retry: {
    maxRetries: 20,
    initialDelay: 3000,
    maxDelay: 60000,
    backoffMultiplier: 1.5,
  },
}

/**
 * 兼容旧路径配置（用于迁移期间）
 */
const legacyPaths = {
  outputDirSql: path.join(ROOT_DIR, 'infinisynapse_output_sql'),
  outputDirCsv: path.join(ROOT_DIR, 'infinisynapse_output_csv'),
  progressFile: path.join(ROOT_DIR, 'progress.json'),
  knowledgeMapFile: path.join(ROOT_DIR, 'knowledge_map.json'),
  logFile: path.join(ROOT_DIR, 'error.log'),
}

/**
 * 创建配置对象
 * @param {Object} overrides - 覆盖的配置项
 * @param {boolean} useLegacyPaths - 是否使用旧路径（兼容模式）
 * @returns {Object} 配置对象
 */
function createConfig(overrides = {}, useLegacyPaths = true) {
  const baseConfig = { ...defaultConfig }
  
  // 如果使用旧路径（默认为兼容模式）
  if (useLegacyPaths) {
    Object.assign(baseConfig, legacyPaths)
  }
  
  // 应用覆盖配置
  return { ...baseConfig, ...overrides }
}

/**
 * 获取配置
 * @param {string} env - 环境名称（可选）
 * @returns {Object} 配置对象
 */
function getConfig(env = null) {
  // 默认使用兼容模式
  return createConfig({}, true)
}

// 导出默认配置（兼容模式）
const CONFIG = createConfig({}, true)

module.exports = {
  CONFIG,
  getConfig,
  createConfig,
  defaultConfig,
  legacyPaths,
  ROOT_DIR,
}
