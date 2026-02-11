/**
 * 格式化工具模块
 */

/**
 * 格式化时间间隔
 * @param {number} ms - 毫秒数
 * @returns {string} 格式化的时间字符串
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 截断字符串
 * @param {string} str - 原字符串
 * @param {number} maxLen - 最大长度
 * @param {string} suffix - 后缀
 * @returns {string} 截断后的字符串
 */
function truncate(str, maxLen = 50, suffix = '...') {
  if (!str || str.length <= maxLen) return str
  return str.substring(0, maxLen) + suffix
}

/**
 * 格式化日期时间
 * @param {Date} date - 日期对象
 * @returns {string} 格式化的日期时间字符串
 */
function formatDateTime(date = new Date()) {
  return date.toLocaleString('zh-CN')
}

/**
 * 格式化 ISO 日期时间
 * @param {Date} date - 日期对象
 * @returns {string} ISO 格式的日期时间字符串
 */
function formatISODateTime(date = new Date()) {
  return date.toISOString()
}

/**
 * 填充字符串
 * @param {string|number} value - 值
 * @param {number} length - 目标长度
 * @param {string} char - 填充字符
 * @param {boolean} left - 是否左填充
 * @returns {string} 填充后的字符串
 */
function pad(value, length, char = ' ', left = true) {
  const str = String(value)
  if (str.length >= length) return str
  const padding = char.repeat(length - str.length)
  return left ? padding + str : str + padding
}

module.exports = {
  formatDuration,
  delay,
  truncate,
  formatDateTime,
  formatISODateTime,
  pad,
}
