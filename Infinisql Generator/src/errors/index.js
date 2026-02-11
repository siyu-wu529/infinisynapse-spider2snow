/**
 * 自定义错误类型模块
 */

/**
 * 基础应用错误
 */
class AppError extends Error {
  constructor(message, code = 'APP_ERROR') {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.timestamp = new Date().toISOString()
  }
}

/**
 * 连接错误（WebSocket 连接失败）
 */
class ConnectionError extends AppError {
  constructor(message, details = null) {
    super(message, 'CONNECTION_ERROR')
    this.name = 'ConnectionError'
    this.details = details
  }
}

/**
 * 超时错误（任务超时）
 */
class TimeoutError extends AppError {
  constructor(message, timeout = null) {
    super(message, 'TIMEOUT_ERROR')
    this.name = 'TimeoutError'
    this.timeout = timeout
  }
}

/**
 * API 错误（HTTP 请求失败）
 */
class ApiError extends AppError {
  constructor(message, statusCode = null, response = null) {
    super(message, 'API_ERROR')
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.response = response
  }
}

/**
 * 认证错误
 */
class AuthError extends AppError {
  constructor(message = '认证失败，请检查 Token') {
    super(message, 'AUTH_ERROR')
    this.name = 'AuthError'
  }
}

/**
 * 配置错误
 */
class ConfigError extends AppError {
  constructor(message, field = null) {
    super(message, 'CONFIG_ERROR')
    this.name = 'ConfigError'
    this.field = field
  }
}

/**
 * 文件操作错误
 */
class FileError extends AppError {
  constructor(message, path = null) {
    super(message, 'FILE_ERROR')
    this.name = 'FileError'
    this.path = path
  }
}

/**
 * 数据源错误
 */
class DatasourceError extends AppError {
  constructor(message, datasourceName = null) {
    super(message, 'DATASOURCE_ERROR')
    this.name = 'DatasourceError'
    this.datasourceName = datasourceName
  }
}

/**
 * 知识库错误
 */
class KnowledgeBaseError extends AppError {
  constructor(message, knowledgeBaseName = null) {
    super(message, 'KNOWLEDGE_BASE_ERROR')
    this.name = 'KnowledgeBaseError'
    this.knowledgeBaseName = knowledgeBaseName
  }
}

/**
 * 任务错误
 */
class TaskError extends AppError {
  constructor(message, taskId = null) {
    super(message, 'TASK_ERROR')
    this.name = 'TaskError'
    this.taskId = taskId
  }
}

/**
 * 判断是否为可重试的错误
 * @param {Error} error - 错误对象
 * @returns {boolean}
 */
function isRetryableError(error) {
  if (error instanceof ConnectionError) return true
  if (error instanceof TimeoutError) return true
  if (error instanceof ApiError) {
    // 5xx 错误和特定 4xx 错误可重试
    const retryableCodes = [408, 429, 500, 502, 503, 504]
    return error.statusCode && retryableCodes.includes(error.statusCode)
  }
  return false
}

/**
 * 获取错误的用户友好消息
 * @param {Error} error - 错误对象
 * @returns {string}
 */
function getErrorMessage(error) {
  if (error instanceof AuthError) {
    return '认证失败，请检查 Token 是否有效'
  }
  if (error instanceof ConnectionError) {
    return `连接失败: ${error.message}`
  }
  if (error instanceof TimeoutError) {
    return `操作超时: ${error.message}`
  }
  if (error instanceof ApiError) {
    return `API 请求失败 (${error.statusCode}): ${error.message}`
  }
  if (error instanceof ConfigError) {
    return `配置错误: ${error.message}`
  }
  if (error instanceof DatasourceError) {
    return `数据源错误: ${error.message}`
  }
  if (error instanceof KnowledgeBaseError) {
    return `知识库错误: ${error.message}`
  }
  return error.message || '未知错误'
}

module.exports = {
  AppError,
  ConnectionError,
  TimeoutError,
  ApiError,
  AuthError,
  ConfigError,
  FileError,
  DatasourceError,
  KnowledgeBaseError,
  TaskError,
  isRetryableError,
  getErrorMessage,
}
