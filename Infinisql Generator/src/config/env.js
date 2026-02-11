/**
 * 环境变量管理模块
 * 
 * 支持多环境配置文件：
 *   - .env (默认)
 *   - .env.1, .env.2 (多实例)
 *   - .env.production, .env.development (环境)
 */

const path = require('path')
const fs = require('fs')

const { ROOT_DIR } = require('./index')

/**
 * 加载环境变量
 * @param {string} envName - 环境名称（如 '1', '2', 'production'）
 * @returns {Object} 加载结果
 */
function loadEnv(envName = null) {
  let envFile = '.env'
  
  if (envName) {
    // 支持多种格式：.env.1, .env.production
    envFile = `.env.${envName}`
  }
  
  const envPath = path.join(ROOT_DIR, envFile)
  
  // 检查文件是否存在
  if (!fs.existsSync(envPath)) {
    // 如果指定了环境但文件不存在，回退到默认 .env
    if (envName) {
      const defaultEnvPath = path.join(ROOT_DIR, '.env')
      if (fs.existsSync(defaultEnvPath)) {
        require('dotenv').config({ path: defaultEnvPath })
        return {
          loaded: true,
          file: '.env',
          fallback: true,
          message: `环境文件 ${envFile} 不存在，已回退到 .env`,
        }
      }
    }
    return {
      loaded: false,
      file: envFile,
      message: `环境文件 ${envFile} 不存在`,
    }
  }
  
  // 加载环境变量
  require('dotenv').config({ path: envPath })
  
  return {
    loaded: true,
    file: envFile,
    path: envPath,
  }
}

/**
 * 从命令行参数解析环境名称
 * @param {string[]} args - 命令行参数
 * @returns {string|null} 环境名称
 */
function parseEnvFromArgs(args = process.argv) {
  const envIndex = args.findIndex(arg => arg === '--env' || arg === '-e')
  if (envIndex !== -1 && args[envIndex + 1]) {
    return args[envIndex + 1]
  }
  return null
}

/**
 * 获取当前环境的 Token
 * @returns {string|null} Token
 */
function getToken() {
  return process.env.AI_GATEWAY_TOKEN || null
}

/**
 * 获取环境变量
 * @param {string} key - 环境变量名
 * @param {*} defaultValue - 默认值
 * @returns {*} 环境变量值
 */
function getEnv(key, defaultValue = null) {
  return process.env[key] || defaultValue
}

/**
 * 初始化环境（加载 .env）
 * @param {string|null} envName - 可选，环境名（如 '1'、'production'）；未传则从 --env 解析，否则加载默认 .env
 * @returns {Object} 初始化结果
 */
function initEnv(envName) {
  const name = envName !== undefined && envName !== null ? envName : parseEnvFromArgs()
  return loadEnv(name || null)
}

module.exports = {
  loadEnv,
  parseEnvFromArgs,
  getToken,
  getEnv,
  initEnv,
}
