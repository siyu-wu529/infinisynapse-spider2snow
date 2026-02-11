/**
 * 本地文件保存服务
 * 
 * 接收来自 Web 端的文件保存请求，将文件保存到指定目录
 * 
 * 使用方法:
 *   node src/server/file-save.js [--port 3001]
 * 
 * Web 端调用示例:
 *   fetch('http://localhost:3001/save', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({
 *       instanceId: 'sf_bq001',
 *       sql: 'SELECT * FROM ...',
 *       csv: 'col1,col2\nval1,val2'
 *     })
 *   })
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

// 默认配置
const defaultConfig = {
  port: 3001,
  outputDirSql: './infinisynapse_output_sql',
  outputDirCsv: './infinisynapse_output_csv',
  allowedOrigins: [
    'https://app.infinisynapse.cn',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ]
}

// 当前配置
let config = { ...defaultConfig }

/**
 * 设置配置
 * @param {Object} newConfig - 新配置
 */
function setConfig(newConfig) {
  config = { ...config, ...newConfig }
}

/**
 * 确保输出目录存在
 */
function ensureDirs() {
  if (!fs.existsSync(config.outputDirSql)) {
    fs.mkdirSync(config.outputDirSql, { recursive: true })
    console.log(`✓ 已创建目录: ${config.outputDirSql}`)
  }
  if (!fs.existsSync(config.outputDirCsv)) {
    fs.mkdirSync(config.outputDirCsv, { recursive: true })
    console.log(`✓ 已创建目录: ${config.outputDirCsv}`)
  }
}

/**
 * 检查来源是否有效
 * @param {string} origin - 请求来源
 * @returns {boolean}
 */
function isValidOrigin(origin) {
  if (!origin) return true
  return config.allowedOrigins.some(allowed => origin.startsWith(allowed))
}

/**
 * 发送响应
 * @param {Object} res - 响应对象
 * @param {number} statusCode - 状态码
 * @param {*} data - 数据
 * @param {string} message - 消息
 */
function sendResponse(res, statusCode, data, message = '') {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end(JSON.stringify({ success: statusCode === 200, data, message }))
}

/**
 * 处理保存请求
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
function handleSaveRequest(req, res) {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    sendResponse(res, 200, null, 'OK')
    return
  }

  // 只接受 POST 请求
  if (req.method !== 'POST') {
    sendResponse(res, 405, null, '只支持 POST 请求')
    return
  }

  // 检查 Origin
  const origin = req.headers.origin
  if (!isValidOrigin(origin)) {
    console.log(`⚠️ 拒绝来源: ${origin}`)
  }

  // 读取请求体
  let body = ''
  req.on('data', chunk => {
    body += chunk.toString()
  })

  req.on('end', () => {
    try {
      const data = JSON.parse(body)
      const { instanceId, sql, csv } = data

      if (!instanceId) {
        sendResponse(res, 400, null, '缺少 instanceId')
        return
      }

      const results = []

      // 保存 SQL 文件
      if (sql) {
        const sqlPath = path.join(config.outputDirSql, `${instanceId}.sql`)
        fs.writeFileSync(sqlPath, sql, 'utf-8')
        results.push({ type: 'sql', path: sqlPath, size: sql.length })
        console.log(`  📄 SQL: ${sqlPath} (${sql.length} 字符)`)
      }

      // 保存 CSV 文件
      if (csv) {
        const csvPath = path.join(config.outputDirCsv, `${instanceId}.csv`)
        fs.writeFileSync(csvPath, csv, 'utf-8')
        results.push({ type: 'csv', path: csvPath, size: csv.length })
        console.log(`  📄 CSV: ${csvPath} (${csv.length} 字符)`)
      }

      if (results.length === 0) {
        sendResponse(res, 400, null, '没有要保存的文件')
        return
      }

      console.log(`✓ 保存完成: ${instanceId}`)
      sendResponse(res, 200, results, `已保存 ${results.length} 个文件`)
    } catch (error) {
      console.error(`✗ 解析请求失败: ${error.message}`)
      sendResponse(res, 400, null, `请求格式错误: ${error.message}`)
    }
  })
}

/**
 * 处理状态请求
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
function handleStatusRequest(req, res) {
  const sqlFiles = fs.existsSync(config.outputDirSql) 
    ? fs.readdirSync(config.outputDirSql).filter(f => f.endsWith('.sql')).length 
    : 0
  const csvFiles = fs.existsSync(config.outputDirCsv) 
    ? fs.readdirSync(config.outputDirCsv).filter(f => f.endsWith('.csv')).length 
    : 0
  
  sendResponse(res, 200, {
    status: 'running',
    port: config.port,
    sqlFiles,
    csvFiles,
    outputDirSql: config.outputDirSql,
    outputDirCsv: config.outputDirCsv
  }, 'Server is running')
}

/**
 * 创建服务器
 * @returns {Object} HTTP 服务器实例
 */
function createServer() {
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0]
    
    console.log(`${new Date().toISOString()} ${req.method} ${url}`)
    
    switch (url) {
      case '/save':
        handleSaveRequest(req, res)
        break
      case '/status':
      case '/':
        handleStatusRequest(req, res)
        break
      default:
        sendResponse(res, 404, null, 'Not Found')
    }
  })
  
  return server
}

/**
 * 启动服务器
 * @param {number} port - 端口号
 * @returns {Promise<Object>} 服务器实例
 */
function start(port = config.port) {
  config.port = port
  ensureDirs()
  
  return new Promise((resolve, reject) => {
    const server = createServer()
    
    server.listen(port, () => {
      console.log('\n════════════════════════════════════════════════════')
      console.log('    📁 本地文件保存服务')
      console.log('════════════════════════════════════════════════════')
      console.log(`  端口: ${port}`)
      console.log(`  SQL 目录: ${config.outputDirSql}`)
      console.log(`  CSV 目录: ${config.outputDirCsv}`)
      console.log('════════════════════════════════════════════════════')
      console.log('')
      console.log('等待文件保存请求...\n')
      
      resolve(server)
    })
    
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`✗ 端口 ${port} 已被占用`)
        console.log('  请尝试其他端口: --port <port>')
      } else {
        console.error(`✗ 服务器错误: ${error.message}`)
      }
      reject(error)
    })
  })
}

/**
 * 解析命令行参数
 * @param {string[]} args - 命令行参数
 * @returns {Object} 解析后的选项
 */
function parseArgs(args = process.argv.slice(2)) {
  const options = { port: defaultConfig.port }
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    if (arg === '--port' || arg === '-p') {
      options.port = parseInt(args[++i], 10) || defaultConfig.port
    } else if (arg === '--sql-dir') {
      config.outputDirSql = args[++i]
    } else if (arg === '--csv-dir') {
      config.outputDirCsv = args[++i]
    } else if (arg === '--help' || arg === '-h') {
      showHelp()
      process.exit(0)
    }
  }
  
  return options
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
本地文件保存服务

用法:
  node src/server/file-save.js [选项]

选项:
  --port, -p <port>    服务端口 (默认: 3001)
  --sql-dir <dir>      SQL 输出目录
  --csv-dir <dir>      CSV 输出目录
  --help, -h           显示帮助

示例:
  node src/server/file-save.js --port 3002
  node src/server/file-save.js --sql-dir ./output/sql --csv-dir ./output/csv
`)
}

// 如果直接运行此文件
if (require.main === module) {
  const options = parseArgs()
  start(options.port).catch(() => process.exit(1))
}

module.exports = {
  start,
  createServer,
  setConfig,
  parseArgs,
}
