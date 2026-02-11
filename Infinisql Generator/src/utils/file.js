/**
 * 文件操作工具模块
 */

const fs = require('fs')
const path = require('path')
const readline = require('readline')

/**
 * 确保目录存在
 * @param {string} dirPath - 目录路径
 * @returns {boolean} 是否成功
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
    return true
  }
  return false
}

/**
 * 确保多个目录存在
 * @param {string[]} dirs - 目录路径数组
 */
function ensureDirs(dirs) {
  for (const dir of dirs) {
    ensureDir(dir)
  }
}

/**
 * 读取 JSONL 文件
 * @param {string} filePath - 文件路径
 * @returns {Promise<Object[]>} 解析后的对象数组
 */
async function readJSONL(filePath) {
  const items = []
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`)
  }
  
  const fileStream = fs.createReadStream(filePath)
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  })
  
  for await (const line of rl) {
    if (line.trim()) {
      try {
        items.push(JSON.parse(line))
      } catch (e) {
        console.error(`解析失败: ${line.substring(0, 50)}...`)
      }
    }
  }
  
  return items
}

/**
 * 读取 JSON 文件
 * @param {string} filePath - 文件路径
 * @param {*} defaultValue - 默认值
 * @returns {Object} 解析后的对象
 */
function readJSON(filePath, defaultValue = {}) {
  if (!fs.existsSync(filePath)) {
    return defaultValue
  }
  
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    console.error(`读取 JSON 文件失败: ${filePath}`, error.message)
    return defaultValue
  }
}

/**
 * 写入 JSON 文件
 * @param {string} filePath - 文件路径
 * @param {Object} data - 数据
 * @param {boolean} pretty - 是否格式化
 */
function writeJSON(filePath, data, pretty = true) {
  const dir = path.dirname(filePath)
  ensureDir(dir)
  
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
  fs.writeFileSync(filePath, content)
}

/**
 * 保存 SQL 文件
 * @param {string} outputDir - 输出目录
 * @param {string} instanceId - 实例 ID
 * @param {string} sqlContent - SQL 内容
 * @returns {boolean} 是否成功
 */
function saveSqlFile(outputDir, instanceId, sqlContent) {
  try {
    ensureDir(outputDir)
    const filePath = path.join(outputDir, `${instanceId}.sql`)
    fs.writeFileSync(filePath, sqlContent, 'utf8')
    console.log(`  ✓ SQL 文件已保存: ${filePath}`)
    return true
  } catch (error) {
    console.error(`  ✗ 保存 SQL 文件失败: ${error.message}`)
    return false
  }
}

/**
 * 保存 CSV 文件
 * @param {string} outputDir - 输出目录
 * @param {string} instanceId - 实例 ID
 * @param {string} csvContent - CSV 内容
 * @returns {boolean} 是否成功
 */
function saveCsvFile(outputDir, instanceId, csvContent) {
  try {
    ensureDir(outputDir)
    const filePath = path.join(outputDir, `${instanceId}.csv`)
    fs.writeFileSync(filePath, csvContent, 'utf8')
    console.log(`  ✓ CSV 文件已保存: ${filePath}`)
    return true
  } catch (error) {
    console.error(`  ✗ 保存 CSV 文件失败: ${error.message}`)
    return false
  }
}

/**
 * 从文本中提取描述（用于知识库）
 * @param {string} content - 文件内容
 * @returns {string} 提取的描述
 */
function extractDescription(content) {
  const lines = content.split('\n')
  let inCode = false
  let paragraphLines = []

  for (const line of lines) {
    // 跳过代码块
    if (line.includes('```')) {
      inCode = !inCode
      continue
    }
    if (inCode) continue

    const stripped = line.trim()

    // 跳过空行
    if (!stripped) {
      if (paragraphLines.length > 0) break
      continue
    }

    // 跳过标题行
    if (stripped.startsWith('#')) continue

    // 收集段落
    paragraphLines.push(stripped)
    if (paragraphLines.length >= 2) break
  }

  return paragraphLines.length > 0 
    ? paragraphLines.join(' ') 
    : lines[0].replace(/#/, '').trim()
}

/**
 * 从响应文本中提取 SQL 和 CSV 文件内容
 * @param {string|Object} text - 响应文本或对象
 * @returns {Object} { csv: string, sql: string }
 */
function extractFiles(text) {
  // 确保 text 是字符串类型
  if (!text) return { csv: '', sql: '' }
  if (typeof text !== 'string') {
    if (typeof text === 'object' && text.fullResponse) {
      text = text.fullResponse
    } else {
      text = String(text)
    }
  }
  
  let csv = ''
  let sql = ''
  
  // 方法1: 处理 JSON 格式的文件创建消息
  try {
    const jsonStartPattern = /\{"tool":"newFileCreated"/g
    let startMatch
    
    while ((startMatch = jsonStartPattern.exec(text)) !== null) {
      const startPos = startMatch.index
      let braceCount = 0
      let inString = false
      let escapeNext = false
      let endPos = startPos
      
      for (let i = startPos; i < text.length; i++) {
        const char = text[i]
        
        if (escapeNext) {
          escapeNext = false
          continue
        }
        
        if (char === '\\') {
          escapeNext = true
          continue
        }
        
        if (char === '"') {
          inString = !inString
          continue
        }
        
        if (!inString) {
          if (char === '{') {
            braceCount++
          } else if (char === '}') {
            braceCount--
            if (braceCount === 0) {
              endPos = i + 1
              break
            }
          }
        }
      }
      
      if (endPos > startPos) {
        const jsonStr = text.substring(startPos, endPos)
        try {
          const jsonObj = JSON.parse(jsonStr)
          
          if (jsonObj.tool === 'newFileCreated' && jsonObj.content && jsonObj.path) {
            const content = jsonObj.content.trim()
            
            if (jsonObj.path.endsWith('.sql') && !sql) {
              sql = content
            } else if (jsonObj.path.endsWith('.csv') && !csv) {
              csv = content
            }
          }
        } catch (e) {
          // JSON 解析失败，跳过
        }
      }
    }
  } catch (e) {
    // JSON 提取失败，继续其他方法
  }
  
  // 方法2: 提取 [SQL]...[/SQL] 格式
  if (!sql) {
    const sqlTagMatches = text.match(/\[SQL\]([\s\S]*?)\[\/SQL\]/gi)
    if (sqlTagMatches && sqlTagMatches.length > 0) {
      const lastBlock = sqlTagMatches[sqlTagMatches.length - 1]
      sql = lastBlock.replace(/\[SQL\]/i, '').replace(/\[\/SQL\]\s*$/, '').trim()
    }
  }
  
  // 方法3: 提取 [CSV]...[/CSV] 格式
  if (!csv) {
    const csvTagMatches = text.match(/\[CSV\]([\s\S]*?)\[\/CSV\]/gi)
    if (csvTagMatches && csvTagMatches.length > 0) {
      const lastBlock = csvTagMatches[csvTagMatches.length - 1]
      csv = lastBlock.replace(/\[CSV\]/i, '').replace(/\[\/CSV\]\s*$/, '').trim()
    }
  }
  
  // 方法4: 提取 ```sql ... ``` 格式
  if (!sql) {
    const sqlBlockMatches = text.match(/```sql\s*([\s\S]*?)```/gi)
    if (sqlBlockMatches && sqlBlockMatches.length > 0) {
      const lastBlock = sqlBlockMatches[sqlBlockMatches.length - 1]
      sql = lastBlock.replace(/```sql\s*/i, '').replace(/```\s*$/, '').trim()
    }
  }
  
  // 方法5: 提取 ```csv ... ``` 格式
  if (!csv) {
    const csvBlockMatches = text.match(/```csv\s*([\s\S]*?)```/gi)
    if (csvBlockMatches && csvBlockMatches.length > 0) {
      const lastBlock = csvBlockMatches[csvBlockMatches.length - 1]
      csv = lastBlock.replace(/```csv\s*/i, '').replace(/```\s*$/, '').trim()
    }
  }
  
  // 方法6: 提取通用代码块中的 SQL
  if (!sql) {
    const genericBlocks = text.match(/```\s*([\s\S]*?)```/g)
    if (genericBlocks && genericBlocks.length > 0) {
      for (let i = genericBlocks.length - 1; i >= 0; i--) {
        const block = genericBlocks[i].replace(/```\s*/g, '').replace(/```\s*$/, '').trim()
        if (block.match(/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\b/i)) {
          sql = block
          break
        }
      }
    }
  }
  
  // 方法7: 直接提取 SELECT 语句
  if (!sql) {
    const selectMatch = text.match(/(SELECT[\s\S]*?)(?=\n\n|\n#|\n--\s*查询结果|$)/i)
    if (selectMatch) {
      sql = selectMatch[1].trim()
    }
  }
  
  // 方法8: 查找所有可能的 SQL 语句
  if (!sql) {
    const allSqlMatches = text.match(/(?:SELECT|WITH|CREATE|INSERT|UPDATE|DELETE|ALTER|DROP)[\s\S]*?;/gi)
    if (allSqlMatches && allSqlMatches.length > 0) {
      sql = allSqlMatches[allSqlMatches.length - 1].trim()
    }
  }
  
  // 方法9: 查找 CSV 格式数据
  if (!csv) {
    const csvLines = text.split('\n')
      .filter(line => {
        const trimmed = line.trim()
        return trimmed && 
               trimmed.includes(',') && 
               !trimmed.startsWith('SELECT') &&
               !trimmed.startsWith('--') &&
               !trimmed.startsWith('#') &&
               !trimmed.match(/^```/)
      })
      .map(line => line.trim())
    if (csvLines.length > 0) {
      csv = csvLines.join('\n')
    }
  }
  
  return { csv, sql }
}

/**
 * 检查文件是否存在
 * @param {string} filePath - 文件路径
 * @returns {boolean}
 */
function fileExists(filePath) {
  return fs.existsSync(filePath)
}

/**
 * 获取目录中的文件列表
 * @param {string} dirPath - 目录路径
 * @param {string} extension - 文件扩展名过滤
 * @returns {string[]} 文件名列表
 */
function listFiles(dirPath, extension = null) {
  if (!fs.existsSync(dirPath)) {
    return []
  }
  
  let files = fs.readdirSync(dirPath)
  if (extension) {
    files = files.filter(f => f.endsWith(extension))
  }
  return files
}

module.exports = {
  ensureDir,
  ensureDirs,
  readJSONL,
  readJSON,
  writeJSON,
  saveSqlFile,
  saveCsvFile,
  extractDescription,
  extractFiles,
  fileExists,
  listFiles,
}
