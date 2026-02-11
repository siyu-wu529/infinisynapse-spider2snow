/**
 * 工具函数模块统一导出
 */

const file = require('./file')
const format = require('./format')
const http = require('./http')
const logger = require('./logger')

module.exports = {
  // 文件操作
  ...file,
  
  // 格式化
  ...format,
  
  // HTTP 请求
  ...http,
  
  // 日志
  logger,
  logError: logger.logError,
  logWarn: logger.logWarn,
  logInfo: logger.logInfo,
  logDebug: logger.logDebug,
  logSuccess: logger.logSuccess,
}
