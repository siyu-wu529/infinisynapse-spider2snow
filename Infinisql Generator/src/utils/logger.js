/**
 * 日志工具模块
 */

const fs = require('fs')
const path = require('path')

// 默认日志文件路径（可以通过 init 函数覆盖）
let logFilePath = null

/**
 * 初始化日志模块
 * @param {string} filePath - 日志文件路径
 */
function init(filePath) {
  logFilePath = filePath
  
  // 确保日志目录存在
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * 记录日志
 * @param {string} level - 日志级别（ERROR, WARN, INFO, DEBUG）
 * @param {string} message - 日志消息
 * @param {Error|null} error - 错误对象
 */
function log(level, message, error = null) {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    level,
    message,
    error: error ? error.message : null,
    stack: error?.stack || null,
  }
  
  // 控制台输出
  const prefix = getLogPrefix(level)
  const consoleMethod = getConsoleMethod(level)
  console[consoleMethod](
    `${prefix} [${level}] ${message}${error ? ': ' + error.message : ''}`
  )
  
  // 写入日志文件
  if (logFilePath) {
    try {
      const logLine = JSON.stringify(logEntry) + '\n'
      fs.appendFileSync(logFilePath, logLine)
    } catch (e) {
      console.error('写入日志失败:', e.message)
    }
  }
}

/**
 * 获取日志前缀
 * @param {string} level - 日志级别
 * @returns {string} 前缀
 */
function getLogPrefix(level) {
  const prefixes = {
    ERROR: '❌',
    WARN: '⚠️',
    INFO: 'ℹ️',
    DEBUG: '🔍',
    SUCCESS: '✓',
  }
  return prefixes[level] || 'ℹ️'
}

/**
 * 获取控制台方法
 * @param {string} level - 日志级别
 * @returns {string} 控制台方法名
 */
function getConsoleMethod(level) {
  const methods = {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'log',
    DEBUG: 'log',
    SUCCESS: 'log',
  }
  return methods[level] || 'log'
}

/**
 * 记录错误日志
 * @param {string} message - 日志消息
 * @param {Error|null} error - 错误对象
 */
function logError(message, error = null) {
  log('ERROR', message, error)
}

/**
 * 记录警告日志
 * @param {string} message - 日志消息
 * @param {Error|null} error - 错误对象
 */
function logWarn(message, error = null) {
  log('WARN', message, error)
}

/**
 * 记录信息日志
 * @param {string} message - 日志消息
 */
function logInfo(message) {
  log('INFO', message)
}

/**
 * 记录调试日志
 * @param {string} message - 日志消息
 */
function logDebug(message) {
  log('DEBUG', message)
}

/**
 * 记录成功日志
 * @param {string} message - 日志消息
 */
function logSuccess(message) {
  log('SUCCESS', message)
}

module.exports = {
  init,
  log,
  logError,
  logWarn,
  logInfo,
  logDebug,
  logSuccess,
}
