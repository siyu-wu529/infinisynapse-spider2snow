/**
 * HTTP 请求工具模块
 */

const http = require('http')
const https = require('https')

/**
 * 发送 HTTP 请求
 * @param {string} url - 请求 URL
 * @param {string} token - JWT Token
 * @param {string} method - 请求方法（GET, POST, PUT, DELETE）
 * @param {Object|null} body - 请求体
 * @returns {Promise<Object>} 响应数据
 */
async function httpRequest(url, token, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const transport = urlObj.protocol === 'https:' ? https : http
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
    
    // 如果有请求体，先序列化为字符串，然后计算 Content-Length
    let bodyString = null
    if (body) {
      bodyString = JSON.stringify(body)
      options.headers['Content-Length'] = Buffer.byteLength(bodyString, 'utf8')
    }
    
    const req = transport.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        // 检查是否返回 HTML（可能是认证页面）
        if (data.includes('<!doctype html>') || data.includes('<html')) {
          resolve({ html: true, data: null })
        } else {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            resolve(data)
          }
        }
      })
    })
    
    req.on('error', reject)
    if (bodyString) {
      req.write(bodyString)
    }
    req.end()
  })
}

/**
 * 发送 multipart/form-data 请求（用于文件上传）
 * @param {string} url - 请求 URL
 * @param {string} token - JWT Token
 * @param {Buffer} fileContent - 文件内容
 * @param {string} filename - 文件名
 * @returns {Promise<Object>} 响应数据
 */
async function uploadRequest(url, token, fileContent, filename) {
  return new Promise((resolve, reject) => {
    const crypto = require('crypto')
    const boundary = '----WebKitFormBoundary' + crypto.randomUUID().substring(0, 16)
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/markdown\r\n\r\n`
    const footer = `\r\n--${boundary}--\r\n`
    
    const bodyContent = Buffer.concat([
      Buffer.from(header, 'utf8'),
      fileContent,
      Buffer.from(footer, 'utf8')
    ])
    
    const urlObj = new URL(url)
    const transport = urlObj.protocol === 'https:' ? https : http
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
    }
    
    const req = transport.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve({ statusCode: res.statusCode, ...json })
        } catch (e) {
          resolve({ statusCode: res.statusCode, raw: data })
        }
      })
    })
    
    req.on('error', reject)
    req.write(bodyContent)
    req.end()
  })
}

module.exports = {
  httpRequest,
  uploadRequest,
}
