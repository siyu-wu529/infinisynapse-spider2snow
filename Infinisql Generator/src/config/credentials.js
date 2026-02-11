/**
 * 凭证加载模块
 * 
 * 管理 Snowflake 数据库连接凭证
 */

const fs = require('fs')
const { CONFIG } = require('./index')

/**
 * 加载凭证文件
 * @param {string} filePath - 凭证文件路径（可选，默认使用配置）
 * @returns {Object} 凭证对象
 */
function loadCredentials(filePath = null) {
  const credFile = filePath || CONFIG.credentialsFile
  
  if (!fs.existsSync(credFile)) {
    console.warn(`⚠️ 凭证文件不存在: ${credFile}`)
    return {}
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(credFile, 'utf8'))
    console.log(`✓ 已加载凭证文件: ${credFile}`)
    return data
  } catch (error) {
    console.error(`加载凭证文件失败: ${error.message}`)
    return {}
  }
}

/**
 * 获取指定前缀的凭证
 * @param {Object} credentials - 凭证对象
 * @param {string} prefix - 凭证前缀
 * @returns {Object|null} 凭证信息
 */
function getCredentialsByPrefix(credentials, prefix) {
  if (!credentials || !prefix) {
    return null
  }
  return credentials[prefix] || null
}

/**
 * 合并凭证信息到配置项
 * @param {Object} config - 原始配置
 * @param {Object} credentials - 凭证对象
 * @returns {Object} 合并后的配置
 */
function mergeCredentials(config, credentials) {
  if (!config.host_prefix || !credentials[config.host_prefix]) {
    return config
  }
  
  const cred = credentials[config.host_prefix]
  return {
    ...config,
    host: cred.host || config.host,
    username: cred.username || config.username,
    password: cred.password || config.password,
  }
}

module.exports = {
  loadCredentials,
  getCredentialsByPrefix,
  mergeCredentials,
}
