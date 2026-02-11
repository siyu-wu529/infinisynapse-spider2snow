/**
 * Infinisql Generator 模块入口
 * 
 * 提供模块化的 API，可以作为库被其他项目引用
 * 
 * @module infinisql-generator
 * @example
 * const infinisql = require('./src')
 * 
 * // 初始化
 * infinisql.init('production')
 * 
 * // 获取配置
 * const config = infinisql.config
 * 
 * // 使用服务
 * const items = await infinisql.utils.readJSONL(config.inputFile)
 */

// 配置模块
const config = require('./config')
const { initEnv, getToken } = require('./config/env')
const { loadCredentials } = require('./config/credentials')
const { loadDatasourceConfig, generateDatasourceConfigTemplate, getUniqueDatasources } = require('./config/datasource')

// 状态管理
const appState = require('./state')

// 错误类型
const errors = require('./errors')

// 工具函数
const utils = require('./utils')

// 进度管理
const progress = require('./handlers/progress')

// 消息处理
const messageHandler = require('./handlers/message')

// 任务处理
const taskHandler = require('./handlers/task')

// 服务
const datasourceService = require('./services/datasource')
const knowledgebaseService = require('./services/knowledgebase')
const websocket = require('./services/websocket')

// 命令
const commands = require('./commands')

// 服务器
const server = require('./server')

/**
 * 初始化 Infinisql Generator
 * @param {string} envName - 环境名称（可选）
 */
function init(envName = null) {
  if (envName) {
    initEnv(envName)
  }
  
  // 加载数据源配置
  appState.datasourceConfigMap = loadDatasourceConfig()
  
  // 加载已保存的进度
  const savedProgress = progress.loadProgress()
  if (savedProgress.datasourceMap) {
    appState.datasourceIdMap = savedProgress.datasourceMap
  }
  
  console.log('✓ Infinisql Generator 已初始化')
}

/**
 * 显示版本信息
 */
function showVersion() {
  console.log('Infinisql Generator v2.0.0')
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
Infinisql Generator - AI Gateway SQL 生成工具

作为库使用:
  const infinisql = require('./src')
  
  // 初始化
  infinisql.init('production')
  
  // 使用服务
  const token = infinisql.getToken()
  await infinisql.commands.runBatch(token, { count: 10 })

命令行使用:
  node src/cli.js --help
`)
}

// 导出所有模块
module.exports = {
  // 初始化
  init,
  showVersion,
  showHelp,
  
  // 配置
  config: config.CONFIG,
  getConfig: config.getConfig,
  loadCredentials,
  loadDatasourceConfig,
  generateDatasourceConfigTemplate,
  getUniqueDatasources,
  initEnv,
  getToken,
  
  // 状态
  appState,
  
  // 错误
  errors,
  
  // 工具
  utils,
  
  // 进度
  progress,
  
  // 处理器
  messageHandler,
  taskHandler,
  
  // 服务
  services: {
    datasource: datasourceService,
    knowledgebase: knowledgebaseService,
    websocket,
  },
  datasourceService,
  knowledgebaseService,
  websocket,
  
  // 命令
  commands,
  
  // 服务器
  server,
  startFileSaveServer: server.startFileSaveServer,
}
