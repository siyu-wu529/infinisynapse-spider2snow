/**
 * NOTE: 第一版（单体） — 第二版入口为 src/cli.js
 *
 * Infinisql Generator：通过 WebSocket 连接 AI Gateway，按 Spider2-Snow 题目
 * 批量生成 Snowflake SQL 与 CSV。本文件为单体实现，逻辑全在此文件；模块化
 * 实现见 `src/cli.js`，功能对齐。
 *
 * 运行: node infinisql_client.js [选项]  或  node infinisql_client.js --help
 *
 * --- 选项摘要 ---
 * 批量: --start <n> --count <n> --random-count <n> --resume --ids-file <path>
 * 单题: --one --id <id> | --one --index <n> | --one --random
 * 状态: --list --tested --stats
 * 数据源: --setup --create-ds <id> --list-ds --show-config --reset-ds --reset-all
 * 知识库: --setup-kb --create-kb <id> --upload-kb <id>
 * 其他: --token <token> --help
 */

require('dotenv').config()
const { io } = require('socket.io-client')
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const http = require('http')
const https = require('https')

// ==================== 配置 ====================

const CONFIG = {
  socketUrl: 'https://app.infinisynapse.cn/ai_gateway',
  apiUrl: 'https://app.infinisynapse.cn',
  datasourceApi: 'https://app.infinisynapse.cn/api/ai_database/add',
  knowledgeCreateApi: '/api/ai_rag_sdk/create',
  uploadApiPrefix: '/api/tools/upload',
  inputFile: '../Spider2/spider2-snow/spider2-snow.jsonl',
  datasourceConfigFile: './snowflake_database_setting.json',
  credentialsFile: './snowflake_credentials.json',
  outputDirSql: './infinisynapse_output_sql',
  outputDirCsv: './infinisynapse_output_csv',
  enableFileWrite: false,  // 是否启用文件写入功能（当前禁用，代码保留）
  progressFile: './progress.json',
  knowledgeMapFile: './knowledge_map.json',  // 知识库映射文件
  logFile: './error.log',           // 错误日志文件
  docsDir: '../Spider2/spider2-snow/resource/documents',
  timeout: 1800000,         // 30 分钟超时（任务时间 0-20 分钟，留出 10 分钟缓冲）
  requestDelay: 5000,       // 5 秒间隔，减少服务器压力
  websocketWaitTimeout: 1200000,  // WebSocket 等待超时（20分钟，覆盖大部分任务时间）
  socketOptions: {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,              // 启用自动重连
    reconnectionAttempts: 20,        // 增加到 20 次
    reconnectionDelay: 3000,         // 初始间隔 3 秒
    reconnectionDelayMax: 60000,     // 最大间隔 60 秒（指数退避）
    withCredentials: true,
    timeout: 30000,
  },
  heartbeatInterval: 30000,  // 心跳间隔 30 秒
  progressSaveInterval: 60000,
}

// ==================== 全局状态 ====================

let socket = null
let accumulatedResponse = ''
let partialResponse = ''
let isProcessing = false
let resolveCurrentTask = null
let taskTimeout = null
let currentTaskId = null  // 当前任务的 task_id
let datasourceIdMap = {} // db_id -> datasource_id 映射
let datasourceConfigMap = {} // db_id -> 数据源连接配置

const stats = {
  total: 0,
  processed: 0,
  success: 0,
  failed: 0,
  startTime: null,
}

// ==================== 凭证加载 ====================

function loadCredentials() {
  if (!fs.existsSync(CONFIG.credentialsFile)) {
    console.warn(`⚠️ 凭证文件不存在: ${CONFIG.credentialsFile}`)
    return {}
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG.credentialsFile, 'utf8'))
    console.log(`✓ 已加载凭证文件: ${CONFIG.credentialsFile}`)
    return data
  } catch (error) {
    console.error(`加载凭证文件失败: ${error.message}`)
    return {}
  }
}

// ==================== 数据源配置加载 ====================

function loadDatasourceConfig() {
  if (!fs.existsSync(CONFIG.datasourceConfigFile)) {
    console.warn(`⚠️ 数据源配置文件不存在: ${CONFIG.datasourceConfigFile}`)
    return {}
  }
  
  // 加载凭证文件
  const credentials = loadCredentials()
  
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG.datasourceConfigFile, 'utf8'))
    
    // 按 instance_id 生成配置，每个 instance_id 对应一个数据源
    const configMap = {}
    
    for (const item of data) {
      const instanceId = item['instance_id']
      const dbId = item['数据源']
      if (!instanceId || !dbId) continue
      
      // 获取凭证信息
      let host = item['主机地址']
      let username = item['用户名']
      let password = item['password']
      
      // 尝试从凭证文件获取敏感信息
      if (item['host_prefix'] && credentials[item['host_prefix']]) {
        const cred = credentials[item['host_prefix']]
        host = cred.host || host
        username = cred.username || username
        password = cred.password || password
      }
      
      // 保留原始 schema 数组（包含带 * 的）
      const originalSchema = Array.isArray(item['schema']) ? item['schema'] : []
      
      // 提取带 * 的 schema 作为主 schema
      let mainSchema = ''
      if (Array.isArray(originalSchema)) {
        const starSchema = originalSchema.find(s => s.includes('*'))
        if (starSchema) {
          mainSchema = starSchema.replace('*', '').trim()
        }
      }
      
      // 数据源名称 = db_id + 主 schema（如 GA360_GOOGLE_ANALYTICS_SAMPLE）
      const datasourceName = mainSchema ? `${dbId}_${mainSchema}` : dbId
      
      // 每个 instance_id 对应一个数据源配置
      const originalDesc = item['数据源描述'] || dbId
      configMap[instanceId] = {
        name: datasourceName,  // 数据源名称 = db_id + schema
        description: originalDesc,  // 描述 = 原中文描述
        type: item['数据源类型'] || 'Snowflake',
        host: host,
        username: username,
        password: password,
        schema: originalSchema,  // 保留完整的 schema 数组
        instance_id: instanceId,
        original_db_id: dbId,
        main_schema: mainSchema,  // 主 schema 名称
      }
    }
    
    return configMap
  } catch (error) {
    console.error(`加载数据源配置失败: ${error.message}`)
    return {}
  }
}

// ==================== 数据源配置模板生成 ====================

function generateDatasourceConfigTemplate() {
  const configMap = loadDatasourceConfig()
  
  // 按 db_id 分组，去重
  const uniqueDbMap = {}
  for (const instanceId of Object.keys(configMap)) {
    const config = configMap[instanceId]
    const dbId = config.original_db_id
    if (!uniqueDbMap[dbId]) {
      uniqueDbMap[dbId] = config
    }
  }
  
  const dbIds = Object.keys(uniqueDbMap)
  
  console.log('\n📋 数据源配置模板（请在 AI Gateway 控制台手动创建）:')
  console.log('═'.repeat(60))
  
  for (const dbId of dbIds) {
    const config = uniqueDbMap[dbId]
    console.log(`\n【数据源名称】: ${dbId}`)
    console.log(`【描述】: ${config.description}`)
    console.log(`【类型】: ${config.type}`)
    console.log(`【主机】: ${config.host}`)
    console.log(`【用户名】: ${config.username}`)
    console.log(`【Schema】: ${config.schema}`)
    console.log('-'.repeat(60))
  }
  
  console.log('\n💡 请在 AI Gateway 控制台中手动创建以上数据源，')
  console.log('   然后运行 --list-ds 获取数据源 ID 并更新配置。')
}

// ==================== 数据源查询 ====================

async function getDatasourceIdByName(token, datasourceName) {
  try {
    const response = await httpRequest(`${CONFIG.apiUrl}/v1/datasources`, token)
    
    if (response.html || !response.data) {
      return null
    }
    
    // 1. 首先尝试精确匹配
    const exactMatch = response.data.find(d => d.name === datasourceName)
    if (exactMatch && exactMatch.id) {
      return exactMatch.id
    }
    
    // 2. 如果精确匹配失败，尝试前缀匹配
    // 查找以 datasourceName 开头的数据源（例如：ETHEREUM_BLOCKCHAIN 匹配 ETHEREUM_BLOCKCHAIN_ETHEREUM_BLOCKCHAIN）
    const prefixMatches = response.data.filter(d => d.name && d.name.startsWith(datasourceName + '_'))
    if (prefixMatches.length > 0) {
      // 选择第一个匹配项
      const match = prefixMatches[0]
      if (match.id) {
        console.log(`  ℹ️ 前缀匹配: "${datasourceName}" -> "${match.name}"`)
        return match.id
      }
    }
    
    return null
  } catch (error) {
    console.error(`  查询数据源 ID 失败: ${error.message}`)
    return null
  }
}

// ==================== HTTP 请求 ====================

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
    if (body) {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

// ==================== 任务状态查询 ====================

// ==================== 数据源创建 ====================

async function createDatasource(token, config) {
  try {
    console.log(`\n📌 创建数据源: ${config.name}`)
    
    // 从 schema 数组中提取带 * 的 schema（实际需要的 schema）
    let mainSchema = 'PUBLIC'
    if (Array.isArray(config.schema)) {
      const starSchema = config.schema.find(s => s.includes('*'))
      if (starSchema) {
        mainSchema = starSchema.replace('*', '').trim()
      } else {
        mainSchema = config.schema[0]
      }
    } else if (config.schema?.includes('*')) {
      mainSchema = config.schema.replace('*', '').trim()
    }
    
    // 正确的请求格式
    const schemaStr = mainSchema
    const databaseStr = config.original_db_id || config.name
    
    // 数据源名称 = 数据库名_SCHEMA名 (如 GEO_OPENSTREETMAP_BOUNDARIES_GEO_OPENSTREETMAP)
    const datasourceName = `${config.original_db_id}_${schemaStr}`
    
    // 描述中说明数据库名和 schema 名，让 AI 知道连接名称中的数据库名部分
    const datasourceDesc = config.description 
      ? `${config.description}。数据库名: ${databaseStr}, Schema: ${schemaStr}`
      : `数据库: ${databaseStr}, Schema: ${schemaStr}`
    
    const body = {
      name: datasourceName,
      description: datasourceDesc,
      type: 'snowflake',
      enabled: 1,
      rag_names: [],
      config: JSON.stringify({
        snowflake_host: config.host,
        snowflake_username: config.username,
        snowflake_password: config.password,
        snowflake_database: databaseStr,
        snowflake_schema: schemaStr,
        deep_optimization: true,
      }),
    }
    
    console.log(`  发送请求...`)
    const response = await httpRequest(CONFIG.datasourceApi, token, 'POST', body)
    
    // 检测重复名称错误
    if (response.code === 1509 && response.message?.includes('duplicate name')) {
      console.log(`  ⚠️ 数据源已存在，查询 ID...`)
      // 查询已存在数据源的 ID
      const existingId = await getDatasourceIdByName(token, datasourceName)
      if (existingId) {
        console.log(`  ✓ 获取到已有数据源 ID: ${existingId}`)
        return existingId
      }
      return 'EXISTS'
    }
    
    if (response.html || response.code === 404 || response.status === 404) {
      console.log(`  ⚠️ API 返回错误`)
      return null
    }
    
    if (response.id || response.data?.id || response.data?.insertedId) {
      const dsId = response.id || response.data?.id || response.data?.insertedId
      console.log(`  ✓ 数据源创建成功，ID: ${dsId}`)
      return dsId
    }
    
    console.log(`  ⚠️ 响应: ${JSON.stringify(response).substring(0, 100)}`)
    return null
  } catch (error) {
    console.error(`  ✗ 创建失败: ${error.message}`)
    return null
  }
}

async function setupDatasources(token) {
  const configMap = loadDatasourceConfig()
  
  // 按 dbId + schema 组合去重（因为同一个数据库可能有多个 schema）
  const uniqueDsMap = {}
  for (const instanceId of Object.keys(configMap)) {
    const config = configMap[instanceId]
    // 使用 dbId + schema 作为唯一键（与 createDatasource 中生成的数据源名称一致）
    const datasourceKey = config.name  // config.name = dbId + schema
    if (!uniqueDsMap[datasourceKey]) {
      uniqueDsMap[datasourceKey] = config
    }
  }
  
  const datasourceKeys = Object.keys(uniqueDsMap)
  
  if (datasourceKeys.length === 0) {
    console.log('没有需要创建的数据源配置')
    return {}
  }
  
  console.log(`\n📊 准备创建 ${datasourceKeys.length} 个数据源...`)
  console.log('（按 dbId + schema 组合去重，每次运行都会重新创建并更新 progress.json）')
  
  // 每次都重新创建，不使用已有的数据源映射
  const newDatasourceMap = {}
  let created = 0
  let exists = 0
  
  for (const datasourceKey of datasourceKeys) {
    const config = uniqueDsMap[datasourceKey]
    const dbName = config.original_db_id
    const schemaName = config.main_schema || 'PUBLIC'
    console.log(`  目标: ${datasourceKey} (数据库: ${dbName}, Schema: ${schemaName})`)
    const dsId = await createDatasource(token, config)
    
    if (dsId === 'EXISTS') {
      console.log(`  ⚠️ ${datasourceKey} 已存在（请在 AI Gateway 控制台删除后重试，或忽略此警告）`)
      exists++
      // 即使存在也需要获取其 ID
      const existingId = await getDatasourceIdByName(token, config.name)
      if (existingId) {
        newDatasourceMap[datasourceKey] = existingId
        console.log(`  ✓ 获取到已有数据源 ID: ${existingId}`)
      }
    } else if (dsId) {
      // 使用 datasourceKey (dbId + schema) 作为 key，而不是只使用 dbName
      newDatasourceMap[datasourceKey] = dsId
      // 同时保存到 dbName key，以便向后兼容
      newDatasourceMap[dbName] = dsId
      created++
      console.log(`  ✓ ${datasourceKey} 创建成功`)
    } else {
      console.log(`  ⚠️ ${datasourceKey} 创建失败`)
    }
    
    // 每个数据源创建后等待一下
    await delay(500)
  }
  
  console.log(`\n📈 数据源设置完成: ${created} 个新建, ${exists} 个已存在`)
  return newDatasourceMap
}

// ==================== 知识库管理 ====================

// 从 md 文件提取描述
function extractDescription(content) {
  const lines = content.split('\n');
  let inCode = false;
  let paragraphLines = [];

  for (const line of lines) {
    // 跳过代码块
    if (line.includes('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;

    const stripped = line.trim();

    // 跳过空行
    if (!stripped) {
      if (paragraphLines.length > 0) break;
      continue;
    }

    // 跳过标题行
    if (stripped.startsWith('#')) continue;

    // 收集段落
    paragraphLines.push(stripped);
    if (paragraphLines.length >= 2) break;
  }

  return paragraphLines.length > 0 
    ? paragraphLines.join(' ') 
    : lines[0].replace(/#/, '').trim();
}

// 加载本地知识库映射
function loadKnowledgeMap() {
  if (!fs.existsSync(CONFIG.knowledgeMapFile)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG.knowledgeMapFile, 'utf8'));
  } catch (error) {
    return {};
  }
}

// 保存知识库映射
function saveKnowledgeMap(map) {
  fs.writeFileSync(CONFIG.knowledgeMapFile, JSON.stringify(map, null, 2));
}

// 查询知识库信息（通过名称或 ID）
async function getKnowledgeBaseInfo(token, nameOrId) {
  try {
    // 尝试多个 API 端点
    const endpoints = [
      { url: '/api/ai_rag_sdk/list', method: 'POST', body: { name: nameOrId } },
      { url: '/api/ai_rag_sdk/get', method: 'POST', body: { name: nameOrId } },
      { url: '/api/tools/knowledges', method: 'GET' },
    ];
    
    for (const endpoint of endpoints) {
      try {
        const fullUrl = endpoint.method === 'GET' 
          ? `${CONFIG.apiUrl}${endpoint.url}`
          : `${CONFIG.apiUrl}${endpoint.url}`;
        const response = await httpRequest(fullUrl, token, endpoint.method, endpoint.body);
        
        if (response.html || response.code === 404) {
          continue;
        }
        
        if (response.code === 200 && response.data) {
          const data = response.data;
          let kb = null;
          
          if (Array.isArray(data)) {
            kb = data.find(k => k.name === nameOrId || k.id === nameOrId || k.kb_id === nameOrId);
          } else if (data.name === nameOrId || data.id === nameOrId || data.kb_id === nameOrId) {
            kb = data;
          }
          
          if (kb) {
            return kb;
          }
        }
      } catch (error) {
        // 继续尝试下一个端点
        continue;
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// 创建知识库（支持多个数据源）
async function createKnowledgeBase(token, name, description, datasourceIds) {
  // 确保 datasourceIds 是数组
  const dsIds = Array.isArray(datasourceIds) ? datasourceIds : [datasourceIds];
  
  // 不发送 id 和 docDir，让服务端自己生成（服务端使用返回的 id 作为 docDir）
  const body = {
    name: name,
    description: description,
    ragDocFilterRelevance: '0',
    requiredExts: ['.md'],
    enabled: '1',
    database_ids: dsIds
  };

  console.log(`\n📋 创建知识库...`);
  console.log(`  名称: ${name}`);
  console.log(`  描述: ${description.substring(0, 80)}...`);
  console.log(`  数据源 (${dsIds.length}个): ${dsIds.slice(0, 3).join(', ')}${dsIds.length > 3 ? '...' : ''}`);

  const result = await httpRequest(CONFIG.apiUrl + CONFIG.knowledgeCreateApi, token, 'POST', body);
  console.log(`  Status: ${result.status || result.code}`);
  console.log(`  API 响应: ${JSON.stringify(result)}`);

  if (result.code === 1506 || result.message?.includes('duplicate')) {
    console.log(`  ⚠️ 知识库名称已存在`);
    
    // 尝试查询已存在的知识库信息
    console.log(`  查询已存在的知识库信息...`);
    const existingKb = await getKnowledgeBaseInfo(token, name);
    
    if (existingKb) {
      const existingId = existingKb.id || existingKb.kb_id;
      console.log(`  ✓ 找到已存在的知识库，ID: ${existingId}`);
      console.log(`  ℹ️ 服务端使用 id 作为 docDir，docDir = ${existingId}`);
      
      // 更新本地映射
      const kbMap = loadKnowledgeMap();
      kbMap[name] = existingId;
      saveKnowledgeMap(kbMap);
      
      return { id: existingId, exists: true };
    }
    
    // 如果查询不到，尝试从本地映射获取
    const kbMap = loadKnowledgeMap();
    if (kbMap[name]) {
      console.log(`  ✓ 从本地映射找到已有 ID: ${kbMap[name]}`);
      console.log(`  ⚠️ 警告：无法通过 API 验证此知识库是否存在，使用本地映射的 ID`);
      return { id: kbMap[name], exists: true };
    }
    
    console.log(`  ❌ 无法找到已存在的知识库信息`);
    return null;
  }

  // 获取服务端返回的 ID（服务端使用 id 作为 docDir）
  const actualId = result.data?.id || result.data?.kb_id || result.id;
  if (!actualId) {
    console.log(`  ❌ 无法获取服务端返回的知识库 ID`);
    console.log(`  响应: ${JSON.stringify(result)}`);
    return null;
  }
  
  console.log(`  ✓ 知识库创建成功，ID: ${actualId}`);
  console.log(`  ℹ️ 服务端使用 id 作为 docDir，docDir = ${actualId}`);
  
  return { id: actualId, exists: false };
}

// 上传文件到知识库
async function uploadFile(token, kbId, filePath, filename) {
  const fileContent = fs.readFileSync(filePath);

  const boundary = '----WebKitFormBoundary' + require('crypto').randomUUID().substring(0, 16);
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/markdown\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;

  const bodyContent = Buffer.concat([
    Buffer.from(header, 'utf8'),
    fileContent,
    Buffer.from(footer, 'utf8')
  ]);

  return new Promise((resolve, reject) => {
    const urlObj = new URL(CONFIG.apiUrl + CONFIG.uploadApiPrefix + '/' + kbId);
    const transport = urlObj.protocol === 'https:' ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyContent.length,
        'x-lang': 'zh_CN',
        'Origin': 'https://app.infinisynapse.cn',
        'Referer': 'https://app.infinisynapse.cn/',
      },
    };

    console.log(`  上传 URL: ${urlObj.href}`);
    console.log(`  文件大小: ${fileContent.length} bytes`);

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`  Status: ${res.statusCode}`);
        if (data) {
          try {
            const json = JSON.parse(data);
            console.log(`  Response: ${JSON.stringify(json)}`);
            if (json.code === 200) {
              console.log(`  ✓ 文件上传成功`);
              resolve(true);
              return;
            }
          } catch (e) {
            console.log(`  Response (raw): ${data.substring(0, 200)}`);
          }
        }
        resolve(res.statusCode === 201 || res.statusCode === 200);
      });

    });

    req.on('error', (error) => {
      console.log(`  ❌ 请求错误: ${error.message}`);
      reject(error);
    });
    req.write(bodyContent);
    req.end();
  });
}

// 创建知识库并上传文件（单个问题）
async function createKnowledge(token, instanceId) {
  const questionsFile = CONFIG.inputFile;
  const docsDir = CONFIG.docsDir;

  // 读取问题数据
  const items = await readJSONL(questionsFile);
  const questionInfo = items.find(i => i.instance_id === instanceId);

  if (!questionInfo) {
    console.error(`❌ 未找到问题: ${instanceId}`);
    return false;
  }

  console.log(`🎯 处理问题: ${instanceId}`);
  console.log(`  db_id: ${questionInfo.db_id}`);
  console.log(`  external_knowledge: ${questionInfo.external_knowledge || 'null'}`);

  // 检查是否有外部知识文档
  const mdFilename = questionInfo.external_knowledge;
  if (!mdFilename || mdFilename === 'null' || mdFilename === '') {
    console.log(`\n✅ 该问题没有外部知识文档，无需创建知识库`);
    return true;
  }

  const mdPath = path.join(docsDir, mdFilename);

  if (!fs.existsSync(mdPath)) {
    console.error(`❌ md 文件不存在: ${mdPath}`);
    return false;
  }

  // 读取 md 文件
  const content = fs.readFileSync(mdPath, 'utf8');
  const description = extractDescription(content);
  const name = mdFilename.replace('.md', '').replace(/\./g, '_');

  // 找出所有使用同一个 md 文件的问题，收集所有关联的数据源
  const relatedDbIds = new Set();
  for (const item of items) {
    if (item.external_knowledge === mdFilename) {
      relatedDbIds.add(item.db_id);
    }
  }
  
  console.log(`  关联数据源 (${relatedDbIds.size}个): ${Array.from(relatedDbIds).join(', ')}`);

  // 获取所有关联数据源的 ID
  const datasourceIds = [];
  for (const dbId of relatedDbIds) {
    const dsId = datasourceIdMap[dbId];
    if (dsId && dsId !== 'EXISTS') {
      datasourceIds.push(dsId);
    } else {
      console.log(`  ⚠️ 数据源 "${dbId}" 未配置`);
    }
  }

  if (datasourceIds.length === 0) {
    console.error(`❌ 没有可用的数据源 ID，请先配置数据源`);
    return false;
  }

  // 尝试创建知识库（关联所有数据源）
  let kbResult = await createKnowledgeBase(token, name, description, datasourceIds);

  if (!kbResult) {
    console.log(`  ❌ 无法创建或获取知识库 ID`);
    return false;
  }

  const kbId = kbResult.id;
  const kbExists = kbResult.exists;

  console.log(`\n📤 上传文件到知识库...`);
  console.log(`  知识库 ID: ${kbId}`);
  console.log(`  知识库状态: ${kbExists ? '已存在' : '新创建'}`);

  // 上传文件
  const success = await uploadFile(token, kbId, mdPath, mdFilename);

  if (success) {
    // 保存到知识库映射文件
    const kbMap = loadKnowledgeMap();
    kbMap[name] = kbId;
    saveKnowledgeMap(kbMap);
    console.log(`  ✓ 已保存到 ${CONFIG.knowledgeMapFile}`);
    
    // 保存详细结果到 knowledge_base.json
    const result = {
      kb_id: kbId,
      name: name,
      datasource_ids: datasourceIds,
      db_ids: Array.from(relatedDbIds),
      md_filename: mdFilename,
      instance_id: instanceId,
      kb_existed: kbExists
    };
    fs.writeFileSync('knowledge_base.json', JSON.stringify(result, null, 2));
    console.log(`\n✅ 结果已保存到 knowledge_base.json`);
  }

  return success;
}

// 一键创建所有知识库
async function setupAllKnowledgeBases(token) {
  const questionsFile = CONFIG.inputFile;
  const docsDir = CONFIG.docsDir;
  const items = await readJSONL(questionsFile);
  
  // 找出所有需要外部知识的问题，收集每个知识库关联的所有数据源
  // md_filename -> { db_ids: Set, instance_ids: [] }
  const knowledgeMap = new Map();
  
  for (const item of items) {
    const mdFilename = item.external_knowledge;
    if (mdFilename && mdFilename !== 'null' && mdFilename !== '') {
      if (!knowledgeMap.has(mdFilename)) {
        knowledgeMap.set(mdFilename, { db_ids: new Set(), instance_ids: [] });
      }
      const entry = knowledgeMap.get(mdFilename);
      entry.db_ids.add(item.db_id);
      entry.instance_ids.push(item.instance_id);
    }
  }
  
  const uniqueKnowledges = Array.from(knowledgeMap.keys());
  console.log(`\n📚 需要创建 ${uniqueKnowledges.length} 个知识库`);
  console.log(`   （共 ${items.length} 个问题，${items.length - uniqueKnowledges.length} 个无需知识库）\n`);
  
  // 加载已有的知识库映射
  const existingKbMap = loadKnowledgeMap();
  const alreadyCreated = uniqueKnowledges.filter(md => {
    const name = md.replace('.md', '').replace(/\./g, '_');
    return existingKbMap[name];
  });
  
  if (alreadyCreated.length > 0) {
    console.log(`✓ 已存在 ${alreadyCreated.length} 个知识库，将跳过`);
  }
  
  let created = 0;
  let skipped = 0;
  let failed = 0;
  
  for (let i = 0; i < uniqueKnowledges.length; i++) {
    const mdFilename = uniqueKnowledges[i];
    const name = mdFilename.replace('.md', '').replace(/\./g, '_');
    const entry = knowledgeMap.get(mdFilename);
    const dbIds = Array.from(entry.db_ids);
    const instanceIds = entry.instance_ids;
    
    console.log(`\n[${i + 1}/${uniqueKnowledges.length}] ${mdFilename}`);
    console.log(`   关联数据源 (${dbIds.length}个): ${dbIds.join(', ')}`);
    console.log(`   关联问题: ${instanceIds.slice(0, 3).join(', ')}${instanceIds.length > 3 ? '...' : ''}`);
    
    // 检查是否已存在
    if (existingKbMap[name]) {
      console.log(`   ✓ 已存在，跳过 (ID: ${existingKbMap[name]})`);
      skipped++;
      continue;
    }
    
    // 检查 md 文件是否存在
    const mdPath = path.join(docsDir, mdFilename);
    if (!fs.existsSync(mdPath)) {
      console.log(`   ❌ md 文件不存在: ${mdPath}`);
      failed++;
      continue;
    }
    
    // 获取所有关联数据源的 ID
    const datasourceIds = [];
    let missingDs = false;
    for (const dbId of dbIds) {
      let dsId = datasourceIdMap[dbId];
      
      // 如果本地映射中没有，尝试通过 API 查询（支持前缀匹配）
      if (!dsId || dsId === 'EXISTS') {
        console.log(`   🔍 通过 API 查询数据源 "${dbId}"...`);
        const foundId = await getDatasourceIdByName(token, dbId);
        if (foundId) {
          dsId = foundId;
          // 更新本地映射
          datasourceIdMap[dbId] = dsId;
          // 保存到 progress.json
          const savedProgress = loadProgress();
          savedProgress.datasourceMap = savedProgress.datasourceMap || {};
          savedProgress.datasourceMap[dbId] = dsId;
          saveProgress(savedProgress);
          console.log(`   ✓ 找到数据源 ID: ${dsId}`);
        }
      }
      
      if (dsId && dsId !== 'EXISTS') {
        datasourceIds.push(dsId);
      } else {
        console.log(`   ⚠️ 数据源 "${dbId}" 未配置`);
        missingDs = true;
      }
    }
    
    if (datasourceIds.length === 0) {
      console.log(`   ❌ 没有可用的数据源 ID，跳过`);
      failed++;
      continue;
    }
    
    if (missingDs) {
      console.log(`   ⚠️ 部分数据源缺失，继续使用已有的 ${datasourceIds.length} 个数据源`);
    }
    
    // 读取 md 文件内容
    const content = fs.readFileSync(mdPath, 'utf8');
    const description = extractDescription(content);
    
    // 创建知识库（关联所有数据源）
    const kbResult = await createKnowledgeBase(token, name, description, datasourceIds);
    
    if (!kbResult) {
      console.log(`   ❌ 无法创建知识库`);
      failed++;
      continue;
    }
    
    const kbId = kbResult.id;
    console.log(`\n📤 上传文件到知识库...`);
    console.log(`   知识库 ID: ${kbId}`);
    
    // 上传文件
    const success = await uploadFile(token, kbId, mdPath, mdFilename);
    
    if (success) {
      // 保存到知识库映射
      const kbMap = loadKnowledgeMap();
      kbMap[name] = kbId;
      saveKnowledgeMap(kbMap);
      console.log(`   ✓ 已保存到 ${CONFIG.knowledgeMapFile}`);
      created++;
    } else {
      failed++;
    }
    
    // 添加延迟，避免请求过快
    await delay(1000);
  }
  
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📊 知识库创建完成:`);
  console.log(`   新创建: ${created}`);
  console.log(`   已跳过: ${skipped}`);
  console.log(`   失败:   ${failed}`);
  console.log(`${'═'.repeat(50)}`);
  
  return { created, skipped, failed };
}

// 上传文件到现有知识库
async function uploadToKnowledge(token, kbId, mdFilename) {
  const docsDir = CONFIG.docsDir;
  const mdPath = path.join(docsDir, mdFilename);

  if (!fs.existsSync(mdPath)) {
    console.error(`❌ md 文件不存在: ${mdPath}`);
    return false;
  }

  console.log(`📤 上传文件: ${mdFilename} 到知识库 ${kbId}`);
  return await uploadFile(token, kbId, mdPath, mdFilename);
}

// ==================== 数据源管理 ====================

async function listDatasources(token) {
  try {
    const response = await httpRequest(`${CONFIG.apiUrl}/v1/datasources`, token)
    
    if (response.html) {
      console.log('\n⚠️ HTTP API 不可用（需要管理员权限或特殊角色）')
      console.log('💡 请在 AI Gateway 控制台中手动管理数据源')
      generateDatasourceConfigTemplate()
      return []
    }
    
    if (response.data) {
      console.log('\n可用数据源:')
      console.log('─'.repeat(60))
      response.data.forEach(ds => {
        console.log(`ID: ${ds.id}`)
        console.log(`  名称: ${ds.name}`)
        console.log(`  类型: ${ds.type}`)
        console.log(`  状态: ${ds.status}`)
        console.log('─'.repeat(60))
      })
    }
    return response.data || []
  } catch (error) {
    console.error('获取数据源列表失败:', error.message)
    generateDatasourceConfigTemplate()
    return []
  }
}

// ==================== 工具函数 ====================

// ==================== 检测已测试问题 ====================

function getTestedIds() {
  const tested = new Set()
  
  // 检查 SQL 输出目录
  if (fs.existsSync(CONFIG.outputDirSql)) {
    const files = fs.readdirSync(CONFIG.outputDirSql)
    for (const file of files) {
      if (file.endsWith('.sql')) {
        const id = file.replace('.sql', '')
        tested.add(id)
      }
    }
  }
  
  // 检查 CSV 输出目录
  if (fs.existsSync(CONFIG.outputDirCsv)) {
    const files = fs.readdirSync(CONFIG.outputDirCsv)
    for (const file of files) {
      if (file.endsWith('.csv')) {
        const id = file.replace('.csv', '')
        tested.add(id)
      }
    }
  }
  
  return tested
}

function displayStats(items, testedIds) {
  const testedArray = Array.from(testedIds)
  const testedCount = testedArray.length
  const totalCount = items.length
  const percent = ((testedCount / totalCount) * 100).toFixed(1)
  
  console.log('\n📊 测试进度统计:')
  console.log('═'.repeat(48))
  console.log(`   总问题数: ${totalCount}`)
  console.log(`   已测试:   ${testedCount}`)
  console.log(`   未测试:   ${totalCount - testedCount}`)
  console.log(`   完成率:   ${percent}%`)
  console.log('═'.repeat(48))
  
  // 进度条
  const barLength = 30
  const filledLength = Math.round((testedCount / totalCount) * barLength)
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength)
  console.log(`   进度: [${bar}] ${percent}%`)
  console.log('')
  
  // 显示未测试的问题
  const untested = items.filter(item => !testedIds.has(item.instance_id))
  if (untested.length > 0 && untested.length <= 10) {
    console.log('📋 未测试的问题:')
    untested.forEach(item => {
      console.log(`   • ${item.instance_id}`)
    })
  }
}

function listQuestions(items, testedIds) {
  console.log('\n可用问题列表:')
  console.log('─'.repeat(60))
  items.forEach((item, idx) => {
    const status = testedIds.has(item.instance_id) ? '✅' : '○'
    const instruction = item.instruction.length > 50 
      ? item.instruction.substring(0, 50) + '...'
      : item.instruction
    console.log(`[${idx.toString().padStart(3, '0')}] ${status} ${item.instance_id}`)
    console.log(`    ${instruction}`)
  })
  console.log('─'.repeat(60))
  console.log(`   ✅ = 已测试 | ○ = 未测试`)
}

// ==================== 命令行参数解析 ====================

function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    start: 0,
    count: -1,
    token: process.env.AI_GATEWAY_TOKEN || '',
    resume: false,
    setup: false,
    listDs: false,
    showConfig: false,
    // 单问题查询选项
    one: false,
    oneId: null,
    oneIndex: null,
    oneRandom: false,
    random: false,  // 批量随机模式
    // 列表选项
    list: false,
    tested: false,
    stats: false,
    // 知识库选项
    createKb: false,
    createKbId: null,
    setupKb: false,        // 一键创建所有知识库
    resetKb: false,        // 清除知识库映射
    resetAll: false,       // 清除所有本地映射（数据源+知识库）
    uploadKb: false,
    uploadKbId: null,
    uploadFilename: null,
    // 数据源选项
    createDs: false,
    createDsId: null,
    // 按文件中的 id 批量处理
    idsFile: null,
  }
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ids-file':
        options.idsFile = args[++i] || null
        break
      case '--start':
        options.start = parseInt(args[++i]) || 0
        break
      case '--count':
        options.count = parseInt(args[++i]) || -1
        break
      case '--random-count':
        options.count = parseInt(args[++i]) || -1
        options.random = true  // 同时启用随机模式
        break
      case '--token':
        options.token = args[++i] || ''
        break
      case '--resume':
        options.resume = true
        break
      case '--setup':
        options.setup = true
        break
      case '--create-ds':
        options.createDs = true
        options.createDsId = args[++i] || null
        break
      case '--list-ds':
        options.listDs = true
        break
      case '--show-config':
        options.showConfig = true
        break
      case '--one':
        options.one = true
        break
      case '--id':
        options.oneId = args[++i]
        break
      case '--index':
        options.oneIndex = parseInt(args[++i]) || null
        break
      case '--random':
        // 只支持 --one --random（单问题随机选择）
        // 批量随机选择请使用 --random-count <n>
        if (options.one) {
          options.oneRandom = true
        } else {
          // 在批量模式下，--random 单独使用无效，需要使用 --random-count <n>
          console.error('错误: 批量随机选择请使用 --random-count <n>')
          console.error('  示例: node infinisql_client.js --random-count 2')
          console.error('  单问题随机选择: node infinisql_client.js --one --random')
          process.exit(1)
        }
        break
      case '--list':
        options.list = true
        break
      case '--tested':
        options.tested = true
        break
      case '--stats':
        options.stats = true
        break
      case '--reset-ds':
        options.resetDs = true
        break
      // 知识库管理选项
      case '--create-kb':
        options.createKb = true
        options.createKbId = args[++i] || null
        break
      case '--setup-kb':
        options.setupKb = true
        break
      case '--reset-kb':
        options.resetKb = true
        break
      case '--reset-all':
        options.resetAll = true
        break
      case '--upload-kb':
        options.uploadKb = true
        options.uploadKbId = args[++i]
        options.uploadFilename = args[++i] || null
        break
      case '--help':
        showHelp()
        process.exit(0)
    }
  }
  
  return options
}

function showHelp() {
  console.log(`
╔══════════════════════════════════════════════╗
║           Infinisql Generator                ║
╚══════════════════════════════════════════════╝

用法: node infinisql_client.js [选项]

【批量处理】
  --start <n>       从第 n 个问题开始 (默认: 0)
  --count <n>       处理 n 个问题 (默认: 全部)
  --random-count <n>  随机选择 n 个未测试的问题并依次处理
  --resume          从上次中断处继续
  --ids-file <path> 从文件读取 instance_id 列表（每行一个），只处理这些

【单问题查询】
  --one --id <id>   按 instance_id 查询 (例如: sf_bq009)
  --one --index <n> 按序号查询 (从 0 开始，例如: 2)
  --one --random    随机选择一个

【查看状态】
  --list            列出所有问题
  --tested          列出已测试的问题
  --stats           显示进度统计

【数据源管理】
  --setup           设置所有数据源（自动清理并重新创建）
  --create-ds <id>  创建单个数据源 (按 instance_id)
  --list-ds         列出可用数据源
  --show-config     显示数据源配置模板
  --reset-ds        清除数据源映射（重新创建模式）
  --reset-all       清除所有本地映射（数据源+知识库）

【知识库管理】
  --setup-kb        一键创建所有知识库并上传文件（自动清理本地映射）
  --setup-kb --reset-kb  清除本地映射后重新创建（已废弃，--setup-kb 已自动清理）
  --create-kb <id>  创建单个知识库并上传 md 文件
  --upload-kb <id>  上传文件到现有知识库

【其他】
  --token <token>   JWT Token
  --help            显示帮助信息

【示例】
  # 批量处理全部问题
  node infinisql_client.js --token XXX

  # 单问题查询
  node infinisql_client.js --one --id sf_bq009
  node infinisql_client.js --one --index 2
  node infinisql_client.js --one --random
  node infinisql_client.js --random-count 2    # 随机选择 2 个未测试问题并依次处理

  # 数据源管理
  node infinisql_client.js --setup
  node infinisql_client.js --reset-all  # 清理所有本地映射

  # 知识库管理
  node infinisql_client.js --setup-kb
  node infinisql_client.js --setup-kb --reset-kb
  node infinisql_client.js --create-kb sf_bq009
  node infinisql_client.js --upload-kb KB_ID filename.md

  # 查看状态
  node infinisql_client.js --stats
  node infinisql_client.js --list
  node infinisql_client.js --tested

输出文件:
  SQL:  ${CONFIG.outputDirSql}/{instance_id}.sql
  CSV:  ${CONFIG.outputDirCsv}/{instance_id}.csv
`)
}

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

function loadProgress() {
  if (fs.existsSync(CONFIG.progressFile)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG.progressFile, 'utf8'))
    } catch (e) {
      console.error('加载进度失败:', e.message)
    }
  }
  return { completed: [], failed: [], datasourceMap: {} }
}

function saveProgress(progress) {
  const progressData = {
    ...progress,
    lastUpdate: new Date().toISOString(),
    stats: {
      total: stats.total,
      processed: stats.processed,
      success: stats.success,
      failed: stats.failed,
    },
    datasourceMap: datasourceIdMap,
  }
  fs.writeFileSync(CONFIG.progressFile, JSON.stringify(progressData, null, 2))
}

function ensureDirs() {
  // 文件写入功能已禁用，但保留代码以便将来使用
  if (!CONFIG.enableFileWrite) {
    return
  }
  
  if (!fs.existsSync(CONFIG.outputDirSql)) {
    fs.mkdirSync(CONFIG.outputDirSql, { recursive: true })
  }
  if (!fs.existsSync(CONFIG.outputDirCsv)) {
    fs.mkdirSync(CONFIG.outputDirCsv, { recursive: true })
  }
}

// 保存 SQL 文件到输出目录（功能已禁用，代码保留）
function saveSqlFile(instanceId, sqlContent) {
  if (!CONFIG.enableFileWrite) {
    return false
  }
  
  try {
    ensureDirs()
    const filePath = path.join(CONFIG.outputDirSql, `${instanceId}.sql`)
    fs.writeFileSync(filePath, sqlContent, 'utf8')
    console.log(`  ✓ SQL 文件已保存: ${filePath}`)
    return true
  } catch (error) {
    console.error(`  ✗ 保存 SQL 文件失败: ${error.message}`)
    return false
  }
}

// 保存 CSV 文件到输出目录（功能已禁用，代码保留）
function saveCsvFile(instanceId, csvContent) {
  if (!CONFIG.enableFileWrite) {
    return false
  }
  
  try {
    ensureDirs()
    const filePath = path.join(CONFIG.outputDirCsv, `${instanceId}.csv`)
    fs.writeFileSync(filePath, csvContent, 'utf8')
    console.log(`  ✓ CSV 文件已保存: ${filePath}`)
    return true
  } catch (error) {
    console.error(`  ✗ 保存 CSV 文件失败: ${error.message}`)
    return false
  }
}

function extractFiles(text) {
  // 确保 text 是字符串类型
  if (!text) return { csv: '', sql: '' }
  if (typeof text !== 'string') {
    // 如果是对象，尝试提取 fullResponse 或转换为字符串
    if (typeof text === 'object' && text.fullResponse) {
      text = text.fullResponse
    } else {
      text = String(text)
    }
  }
  
  let csv = ''
  let sql = ''
  
  // 优先方法: 处理 JSON 格式的文件创建消息（Web 端的主要格式）
  // 先提取 JSON 格式，因为这是 Web 端返回的标准格式
  try {
    // 查找所有包含 newFileCreated 的 JSON 对象
    // 使用更智能的匹配：找到 {"tool":"newFileCreated" 开始，找到匹配的 } 结束
    const jsonStartPattern = /\{"tool":"newFileCreated"/g
    let startMatch
    
    while ((startMatch = jsonStartPattern.exec(text)) !== null) {
      const startPos = startMatch.index
      let braceCount = 0
      let inString = false
      let escapeNext = false
      let endPos = startPos
      
      // 从开始位置查找匹配的结束括号
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
            // content 已经是解析后的字符串，不需要再处理转义字符
            // JSON.parse 已经自动处理了转义字符
            const content = jsonObj.content.trim()
            
            // 根据文件扩展名分配内容
            if (jsonObj.path.endsWith('.sql') && !sql) {
              sql = content
            } else if (jsonObj.path.endsWith('.csv') && !csv) {
              csv = content
            }
          }
        } catch (e) {
          // JSON 解析失败，跳过这个对象
        }
      }
    }
  } catch (e) {
    // JSON 提取失败，继续其他方法
  }
  
  // 方法1: 提取 [SQL]...[/SQL] 格式
  const sqlTagMatches = text.match(/\[SQL\]([\s\S]*?)\[\/SQL\]/gi)
  if (sqlTagMatches && sqlTagMatches.length > 0) {
    const lastBlock = sqlTagMatches[sqlTagMatches.length - 1]
    sql = lastBlock.replace(/\[SQL\]/i, '').replace(/\[\/SQL\]\s*$/, '').trim()
  }
  
  // 方法2: 提取 [CSV]...[/CSV] 格式
  const csvTagMatches = text.match(/\[CSV\]([\s\S]*?)\[\/CSV\]/gi)
  if (csvTagMatches && csvTagMatches.length > 0) {
    const lastBlock = csvTagMatches[csvTagMatches.length - 1]
    csv = lastBlock.replace(/\[CSV\]/i, '').replace(/\[\/CSV\]\s*$/, '').trim()
  }
  
  // 方法3: 提取 ```sql ... ``` 格式（支持多行）
  if (!sql) {
    const sqlBlockMatches = text.match(/```sql\s*([\s\S]*?)```/gi)
    if (sqlBlockMatches && sqlBlockMatches.length > 0) {
      const lastBlock = sqlBlockMatches[sqlBlockMatches.length - 1]
      sql = lastBlock.replace(/```sql\s*/i, '').replace(/```\s*$/, '').trim()
    }
  }
  
  // 方法4: 提取 ```csv ... ``` 格式（支持多行）
  if (!csv) {
    const csvBlockMatches = text.match(/```csv\s*([\s\S]*?)```/gi)
    if (csvBlockMatches && csvBlockMatches.length > 0) {
      const lastBlock = csvBlockMatches[csvBlockMatches.length - 1]
      csv = lastBlock.replace(/```csv\s*/i, '').replace(/```\s*$/, '').trim()
    }
  }
  
  // 方法5: 提取通用代码块 ``` ... ```（如果没有指定语言）
  if (!sql) {
    const genericBlocks = text.match(/```\s*([\s\S]*?)```/g)
    if (genericBlocks && genericBlocks.length > 0) {
      // 查找包含 SQL 关键字的代码块
      for (let i = genericBlocks.length - 1; i >= 0; i--) {
        const block = genericBlocks[i].replace(/```\s*/g, '').replace(/```\s*$/, '').trim()
        if (block.match(/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\b/i)) {
          sql = block
          break
        }
      }
    }
  }
  
  // 方法6: 提取文件路径后的内容（例如 "sf_bq001.sql:" 或 "SQL 文件:" 后的内容）
  if (!sql) {
    const sqlFileMatch = text.match(/(?:SQL\s*文件|\.sql)[:\s]*\n([\s\S]*?)(?:\n\n|\nCSV|\n1\.|$)/i)
    if (sqlFileMatch) {
      sql = sqlFileMatch[1].trim()
    }
  }
  
  if (!csv) {
    const csvFileMatch = text.match(/(?:CSV\s*文件|\.csv)[:\s]*\n([\s\S]*?)(?:\n\n|\n2\.|$)/i)
    if (csvFileMatch) {
      csv = csvFileMatch[1].trim()
    }
  }
  
  // 方法7: 尝试直接提取 SELECT 语句（更精确的匹配）
  if (!sql) {
    const selectMatch = text.match(/(SELECT[\s\S]*?)(?=\n\n|\n#|\n--\s*查询结果|$)/i)
    if (selectMatch) {
      sql = selectMatch[1].trim()
    }
  }
  
  // 方法8: 处理 JSON 格式的文件创建消息（Web 端可能返回这种格式）
  // 优先处理 JSON 格式，因为这是 Web 端的主要格式
  if (!csv) {
    try {
      // 匹配所有 JSON 格式的文件创建消息（支持多行和转义字符）
      const jsonPattern = /\{"tool":"newFileCreated","path":"[^"]+\.csv","content":"([^"\\]*(\\.[^"\\]*)*)"\}/g
      let match
      let lastMatch = null
      while ((match = jsonPattern.exec(text)) !== null) {
        lastMatch = match[0]
      }
      
      if (lastMatch) {
        const jsonObj = JSON.parse(lastMatch)
        if (jsonObj.content) {
          // 处理转义字符：\n -> 换行, \" -> ", \\ -> \
          csv = jsonObj.content
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
            .trim()
        }
      }
    } catch (e) {
      // JSON 解析失败，继续其他方法
    }
  }
  
  // 方法9: 尝试提取 CSV 数据（包含逗号分隔的行）
  if (!csv) {
    // 查找包含表头和数据行的 CSV 格式
    const csvSection = text.match(/(?:CSV|结果|数据)[:\s]*\n([\s\S]*?)(?=\n\n|\n--|$)/i)
    if (csvSection) {
      const lines = csvSection[1].split('\n')
        .filter(line => line.trim() && (line.includes(',') || line.match(/^[^,]+,[^,]+/)))
        .map(line => line.trim())
      if (lines.length > 0) {
        csv = lines.join('\n')
      }
    }
  }
  
  // 方法10: 从 JSON 格式的 SQL 文件消息中提取 SQL（优先处理）
  if (!sql) {
    try {
      // 匹配所有 JSON 格式的文件创建消息（支持多行和转义字符）
      const jsonPattern = /\{"tool":"newFileCreated","path":"[^"]+\.sql","content":"([^"\\]*(\\.[^"\\]*)*)"\}/g
      let match
      let lastMatch = null
      while ((match = jsonPattern.exec(text)) !== null) {
        lastMatch = match[0]
      }
      
      if (lastMatch) {
        const jsonObj = JSON.parse(lastMatch)
        if (jsonObj.content) {
          // 处理转义字符：\n -> 换行, \" -> ", \\ -> \
          sql = jsonObj.content
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
            .trim()
        }
      }
    } catch (e) {
      // JSON 解析失败，继续其他方法
    }
  }
  
  // 方法11: 如果还是没有找到，尝试从整个文本中提取（最后的手段）
  if (!sql) {
    // 查找所有可能的 SQL 语句
    const allSqlMatches = text.match(/(?:SELECT|WITH|CREATE|INSERT|UPDATE|DELETE|ALTER|DROP)[\s\S]*?;/gi)
    if (allSqlMatches && allSqlMatches.length > 0) {
      sql = allSqlMatches[allSqlMatches.length - 1].trim()
    }
  }
  
  if (!csv) {
    // 查找包含逗号分隔的数据行
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

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ==================== 错误日志 ====================

function logError(level, message, error = null) {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    level,
    message,
    error: error ? error.message : null,
    stack: error?.stack || null,
  }
  
  // 控制台输出
  const prefix = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : 'ℹ️'
  console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](
    `${prefix} [${level}] ${message}${error ? ': ' + error.message : ''}`
  )
  
  // 写入日志文件
  try {
    const logLine = JSON.stringify(logEntry) + '\n'
    fs.appendFileSync(CONFIG.logFile, logLine)
  } catch (e) {
    console.error('写入日志失败:', e.message)
  }
}

// ==================== 资源清理 ====================

function clearCurrentTask() {
  // 清理当前任务状态
  if (taskTimeout) {
    clearTimeout(taskTimeout)
    taskTimeout = null
  }
  accumulatedResponse = ''
  partialResponse = ''
  resolveCurrentTask = null
}

function cleanupResources() {
  // 停止心跳
  stopHeartbeat()
  
  // 清理当前任务
  clearCurrentTask()
  
  // 断开 socket 连接
  if (socket) {
    socket.removeAllListeners()
    if (socket.connected) {
      socket.disconnect()
    }
    socket = null
  }
  
  logError('INFO', '资源已清理')
}

// ==================== WebSocket 管理 ====================

// ==================== 心跳机制 ====================

function startHeartbeat() {
  stopHeartbeat()
  heartbeatTimer = setInterval(() => {
    if (socket && socket.connected) {
      // 发送心跳包
      socket.emit('webviewMessage', { type: 'ping', timestamp: Date.now() })
      lastActivityTime = Date.now()
    } else {
      console.log('⚠️ 心跳检测: 连接已断开')
    }
  }, CONFIG.heartbeatInterval)
  console.log(`✓ 心跳已启动 (间隔 ${CONFIG.heartbeatInterval / 1000}s)`)
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function initSocket(token) {
  return new Promise((resolve, reject) => {
    socket = io(CONFIG.socketUrl, {
      ...CONFIG.socketOptions,
      auth: { Authorization: token },
    })
    
    socket.on('connect', () => {
      console.log('✓ 已连接到 AI Gateway')
      socket.emit('webviewMessage', { type: 'webviewDidLaunch' })
      startHeartbeat()  // 启动心跳
      resolve(socket)
    })
    
    socket.on('connect_error', (error) => {
      console.error('连接失败:', error.message)
      if (error.message.includes('Authentication')) {
        reject(new Error('认证失败，请检查 Token'))
      }
    })
    
    socket.on('disconnect', (reason) => {
      console.log(`\n⚠️ WebSocket 连接断开: ${reason}`)
      stopHeartbeat()  // 断开时停止心跳
      
      // 如果有正在进行的任务，检查是否已经收到完整结果
      if (resolveCurrentTask) {
        // 如果已经收到 completion_result，使用完整响应
        if (hasCompletionResult && accumulatedResponse) {
          console.log('  ✓ 已收到完整响应，使用完整响应')
          const files = extractFiles(accumulatedResponse)
          const resolve = resolveCurrentTask
          resolveCurrentTask = null
          // 清除超时定时器
          if (taskTimeout) {
            clearTimeout(taskTimeout)
            taskTimeout = null
          }
          // 清除进度提示定时器
          if (currentProgressTimer) {
            clearInterval(currentProgressTimer)
            currentProgressTimer = null
          }
          resolve({ ...files, fullResponse: accumulatedResponse })
        } else {
          // 没有收到完整结果，但任务可能还在服务器端运行
          // 如果是因为连接超时断开（transport close），任务可能还在运行
          if (reason === 'transport close' && currentTaskId) {
            console.log('  ⚠️ 连接因超时断开，但任务可能仍在服务器端运行')
            console.log(`  ⚠️ 任务 ID: ${currentTaskId}，将在重连后继续等待 completion_result`)
            // 不立即 resolve，等待重连后继续等待 completion_result
            // 标记为断开，但不 resolve，让重连逻辑处理
            // 注意：这里不 resolve，让重连后继续等待
          } else {
            // 其他原因断开，标记为不完整
            console.log('  ⚠️ 未收到完整响应，任务状态未知')
            const response = partialResponse || accumulatedResponse || ''
            const files = response ? extractFiles(response) : { sql: null, csv: null }
            // 标记为不完整和断开
            resolveCurrentTask({ ...files, fullResponse: response, incomplete: true, disconnected: true })
            resolveCurrentTask = null
            // 清除超时定时器
            if (taskTimeout) {
              clearTimeout(taskTimeout)
              taskTimeout = null
            }
            // 清除进度提示定时器
            if (currentProgressTimer) {
              clearInterval(currentProgressTimer)
              currentProgressTimer = null
            }
            hasCompletionResult = false  // 重置标记
          }
        }
      } else {
        // 没有正在进行的任务，尝试自动重连（如果正在批量处理）
        if (isProcessing) {
          console.log('  🔄 正在批量处理中，将在下次任务时自动重连')
        }
      }
    })
    
    // 监听重连事件
    socket.on('reconnect', (attemptNumber) => {
      console.log(`\n✓ WebSocket 已重连 (尝试次数: ${attemptNumber})`)
      startHeartbeat()  // 重连后重启心跳
      lastActivityTime = Date.now()  // 更新活动时间
      // 发送 webviewDidLaunch 消息，确保连接正常
      if (socket && socket.connected) {
        socket.emit('webviewMessage', { type: 'webviewDidLaunch' })
      }
      // 如果有正在进行的任务且未收到 completion_result，继续等待
      if (resolveCurrentTask && currentTaskId && !hasCompletionResult) {
        console.log(`  ✓ 重连成功，继续等待任务完成 (task_id: ${currentTaskId})`)
        console.log(`  ⏳ 任务可能仍在服务器端运行，等待 completion_result...`)
      }
    })
    
    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`  🔄 正在尝试重连 (${attemptNumber}/20)...`)
    })
    
    socket.on('reconnect_error', (error) => {
      console.log(`  ⚠️ 重连失败: ${error.message}`)
    })
    
    socket.on('reconnect_failed', () => {
      console.log(`  ✗ 重连失败，已达到最大重试次数`)
    })
    
    socket.on('webviewMessage', handleServerMessage)
    socket.connect()
  })
}

let reconnectAttempts = 0
let currentTask = null
let reconnectDelay = 3000
let isReconnecting = false
let heartbeatTimer = null  // 心跳定时器
let lastActivityTime = Date.now()  // 最后活动时间

function handleServerMessage(message) {
  // 重置重连计数
  reconnectAttempts = 0
  // 更新最后活动时间（收到任何消息都表示连接活跃）
  lastActivityTime = Date.now()
  
  switch (message.type) {
    case 'state':
      handleStateMessage(message)
      break
    case 'partialMessage':
      const partial = message.partialMessage
      
      // 调试：输出 partialMessage 结构（如果启用调试模式）
      if (process.env.DEBUG_WEBSOCKET === '1') {
        console.log('\n🔍 调试：收到 partialMessage:', JSON.stringify(partial, null, 2).substring(0, 500))
      }
      
      // 检查是否是 completion_result 消息（可能是 say 类型或 ask 类型）
      if (partial && (partial.say === 'completion_result' || partial.ask === 'completion_result')) {
        // 只有在还有待处理的任务时才处理完成消息
        if (resolveCurrentTask) {
          console.log('\n ✓ 完成 (从 partialMessage 收到)')
          hasCompletionResult = true
          const finalResponse = partial.text || accumulatedResponse || partialResponse || ''
          accumulatedResponse = finalResponse
          
          // 提取文件并 resolve
          const files = extractFiles(finalResponse)
          const resolve = resolveCurrentTask
          resolveCurrentTask = null
          if (taskTimeout) {
            clearTimeout(taskTimeout)
            taskTimeout = null
          }
          // 清除进度提示定时器
          if (currentProgressTimer) {
            clearInterval(currentProgressTimer)
            currentProgressTimer = null
          }
          resolve({ ...files, fullResponse: finalResponse })
        }
        return
      }
      
      // 检查是否是 task 完成消息（根据文档，say === 'task' 也表示任务完成）
      if (partial && partial.say === 'task') {
        // 只有在还有待处理的任务时才处理完成消息
        if (resolveCurrentTask) {
          console.log('\n ✓ 任务完成 (从 partialMessage 收到)')
          hasCompletionResult = true
          const finalResponse = accumulatedResponse || partialResponse || ''
          
          const files = extractFiles(finalResponse)
          const resolve = resolveCurrentTask
          resolveCurrentTask = null
          if (taskTimeout) {
            clearTimeout(taskTimeout)
            taskTimeout = null
          }
          // 清除进度提示定时器
          if (currentProgressTimer) {
            clearInterval(currentProgressTimer)
            currentProgressTimer = null
          }
          resolve({ ...files, fullResponse: finalResponse })
        }
        return
      }
      
      // 原有的文本累积逻辑
      if (partial && partial.text) {
        // 累积所有部分响应，而不是只保存最后一个
        partialResponse = partial.text
        // 同时累积到 accumulatedResponse 中
        if (!accumulatedResponse) {
          accumulatedResponse = partialResponse
        } else {
          // 追加新的内容（避免重复）
          if (!accumulatedResponse.includes(partialResponse)) {
            accumulatedResponse += partialResponse
          } else {
            // 如果已包含，可能是更新，尝试替换或追加
            accumulatedResponse = partialResponse
          }
        }
        process.stdout.write('.')
      }
      break
  }
}

function handleStateMessage(message) {
  const state = message.state
  
  // 尝试从消息中提取 task_id
  if (state && state.taskId) {
    currentTaskId = state.taskId
    console.log(`📌 从 WebSocket 消息获取到任务 ID: ${currentTaskId}`)
  } else if (message.taskId) {
    currentTaskId = message.taskId
    console.log(`📌 从消息对象获取到任务 ID: ${currentTaskId}`)
  }
  
  if (state && state.clineMessages && state.clineMessages.length > 0) {
    // 首先查找工具调用消息（文件创建消息）- 直接获取原始内容，不做任何处理
    const toolFiles = { sql: '', csv: '' }
    
    // 调试：输出所有消息类型，帮助诊断
    if (process.env.DEBUG_TOOLS) {
      console.log(`\n🔍 调试：检查 ${state.clineMessages.length} 条消息中的工具调用...`)
      state.clineMessages.forEach((msg, idx) => {
        if (msg.tool || (msg.say && typeof msg.say === 'object' && msg.say.tool) || 
            (msg.text && msg.text.includes('newFileCreated'))) {
          console.log(`  消息 ${idx}:`, JSON.stringify(msg, null, 2).substring(0, 500))
        }
      })
    }
    
    for (const msg of state.clineMessages) {
      // 检查是否是工具调用消息 - 多种可能的格式
      // 格式1: msg.tool 字段（工具调用消息）
      if (msg.tool && msg.tool === 'newFileCreated') {
        if (msg.path && msg.content !== undefined) {
          // 直接使用原始内容，不做任何处理（不 trim，不转义）
          const content = typeof msg.content === 'string' ? msg.content : String(msg.content)
          if (msg.path.endsWith('.sql')) {
            toolFiles.sql = content
            console.log(`  📄 从工具调用(msg.tool)直接获取 SQL: ${content.length} 字符`)
          } else if (msg.path.endsWith('.csv')) {
            toolFiles.csv = content
            console.log(`  📄 从工具调用(msg.tool)直接获取 CSV: ${content.length} 字符`)
          }
        }
      }
      
      // 格式1.5: msg 本身就是工具调用对象（可能的结构）
      if (msg.type === 'tool' || (msg.name && msg.name === 'newFileCreated')) {
        if (msg.path && msg.content !== undefined) {
          const content = typeof msg.content === 'string' ? msg.content : String(msg.content)
          if (msg.path.endsWith('.sql') && !toolFiles.sql) {
            toolFiles.sql = content
            console.log(`  📄 从工具调用(msg.type/name)直接获取 SQL: ${content.length} 字符`)
          } else if (msg.path.endsWith('.csv') && !toolFiles.csv) {
            toolFiles.csv = content
            console.log(`  📄 从工具调用(msg.type/name)直接获取 CSV: ${content.length} 字符`)
          }
        }
      }
      // 格式2: msg.say 是对象，包含工具调用信息
      if (msg.say && typeof msg.say === 'object' && msg.say.tool === 'newFileCreated') {
        if (msg.say.path && msg.say.content !== undefined) {
          // 直接使用原始内容，不做任何处理
          const content = msg.say.content
          if (msg.say.path.endsWith('.sql')) {
            toolFiles.sql = content
            console.log(`  📄 从工具调用(msg.say)直接获取 SQL: ${typeof content === 'string' ? content.length : 'object'} 字符`)
          } else if (msg.say.path.endsWith('.csv')) {
            toolFiles.csv = content
            console.log(`  📄 从工具调用(msg.say)直接获取 CSV: ${typeof content === 'string' ? content.length : 'object'} 字符`)
          }
        }
      }
      // 格式3: msg.text 中包含 JSON 格式的工具调用（需要解析 JSON，但内容保持原样）
      if (msg.text && typeof msg.text === 'string' && msg.text.includes('"tool":"newFileCreated"')) {
        try {
          // 使用智能括号匹配提取完整的 JSON 对象
          const jsonStartPattern = /\{"tool":"newFileCreated"/g
          let startMatch
          while ((startMatch = jsonStartPattern.exec(msg.text)) !== null) {
            const startPos = startMatch.index
            let braceCount = 0
            let inString = false
            let escapeNext = false
            let endPos = startPos
            
            for (let i = startPos; i < msg.text.length; i++) {
              const char = msg.text[i]
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
              const jsonStr = msg.text.substring(startPos, endPos)
              const jsonObj = JSON.parse(jsonStr)
              if (jsonObj.tool === 'newFileCreated' && jsonObj.path && jsonObj.content !== undefined) {
                // JSON.parse 已经处理了转义字符，直接使用解析后的内容
                const content = jsonObj.content
                if (jsonObj.path.endsWith('.sql') && !toolFiles.sql) {
                  toolFiles.sql = content
                  console.log(`  📄 从工具调用(msg.text JSON)直接获取 SQL: ${typeof content === 'string' ? content.length : 'object'} 字符`)
                } else if (jsonObj.path.endsWith('.csv') && !toolFiles.csv) {
                  toolFiles.csv = content
                  console.log(`  📄 从工具调用(msg.text JSON)直接获取 CSV: ${typeof content === 'string' ? content.length : 'object'} 字符`)
                }
              }
            }
          }
        } catch (e) {
          // JSON 解析失败，忽略
        }
      }
    }
    
    // 检查所有消息中是否有 completion_result（可能是 say 类型或 ask 类型）
    // 从后往前查找，优先找到 say 类型的 completion_result（包含完整文本）
    let hasCompletion = false
    let completionText = ''
    let completionMsg = null
    
    // 获取最后一条消息（用于错误检查）
    const lastMsg = state.clineMessages.length > 0 ? state.clineMessages[state.clineMessages.length - 1] : null
    
    for (let i = state.clineMessages.length - 1; i >= 0; i--) {
      const msg = state.clineMessages[i]
      if (msg.say === 'completion_result' || msg.ask === 'completion_result') {
        hasCompletion = true
        // 优先使用 say 类型的 completion_result（包含完整文本）
        if (msg.say === 'completion_result' && msg.text && !completionText) {
          completionText = msg.text
          completionMsg = msg
        } else if (!completionMsg) {
          // 如果没有找到 say 类型，保存 ask 类型作为备选
          completionMsg = msg
        }
      }
    }
    
    if (hasCompletion) {
      console.log(' ✓ 收到 completion_result，任务完成')
      hasCompletionResult = true  // 标记已收到完整结果（必须在 resolve 之前设置）
      
      // 优先使用 say 类型的 completion_result 文本，如果没有则使用找到的消息的文本，再没有则使用累积的响应
      const finalResponse = completionText || (completionMsg && completionMsg.text) || accumulatedResponse || partialResponse || ''
      accumulatedResponse = finalResponse
      
      if (resolveCurrentTask) {
        console.log(`  ✓ 确认任务完成，准备 resolve sendTask Promise`)
        // 优先使用从工具调用中直接获取的文件（原始内容，不做任何处理）
        let files = { sql: '', csv: '' }
        if (toolFiles.sql || toolFiles.csv) {
          // 使用工具调用中直接获取的文件（原始内容）
          files = toolFiles
          console.log(`  ✓ 使用工具调用创建的文件（原始内容，未处理）`)
        } else {
          // 如果工具调用中没有，才从文本中提取（备用方法）
          files = extractFiles(finalResponse)
          console.log(`  ⚠️ 未找到工具调用，尝试从文本提取`)
        }
        
        // 调试信息：显示提取结果
        if (files.sql) {
          console.log(`  📄 最终 SQL: ${files.sql.length} 字符`)
        } else {
          console.log(`  ⚠️ 未提取到 SQL`)
        }
        if (files.csv) {
          console.log(`  📄 最终 CSV: ${files.csv.length} 字符`)
        } else {
          console.log(`  ⚠️ 未提取到 CSV`)
        }
        
        // 如果仍未提取到内容，检查响应中是否包含 JSON
        if (!files.sql && !files.csv) {
          const hasJson = finalResponse.includes('"tool":"newFileCreated"')
          if (hasJson) {
            console.log(`  🔍 响应中包含 JSON 文件消息，但提取失败`)
            // 输出前 500 个字符用于调试
            console.log(`  📝 响应预览: ${finalResponse.substring(0, 500)}...`)
          }
        }
        
        const resolve = resolveCurrentTask
        resolveCurrentTask = null
        currentTaskId = null  // 清空 taskId，表示任务已完成
        // 清除超时定时器
        if (taskTimeout) {
          clearTimeout(taskTimeout)
          taskTimeout = null
        }
        // 清除进度提示定时器
        if (currentProgressTimer) {
          clearInterval(currentProgressTimer)
          currentProgressTimer = null
        }
        // 立即 resolve，不等待（任务已完成，收到 completion_result）
        console.log(`  ✓ sendTask Promise 已 resolve，任务处理完成`)
        resolve({ ...files, fullResponse: finalResponse })
      }
    } else if (lastMsg.say === 'error' || lastMsg.ask === 'error') {
      console.log(' ✗ AI 错误')
      hasCompletionResult = true  // 即使出错也算收到响应（必须在 resolve 之前设置）
      if (resolveCurrentTask) {
        console.log(`  ✓ 收到错误消息，准备 resolve sendTask Promise`)
        const resolve = resolveCurrentTask
        resolveCurrentTask = null
        currentTaskId = null  // 清空 taskId
        // 清除超时定时器
        if (taskTimeout) {
          clearTimeout(taskTimeout)
          taskTimeout = null
        }
        // 清除进度提示定时器
        if (currentProgressTimer) {
          clearInterval(currentProgressTimer)
          currentProgressTimer = null
        }
        resolve({ csv: null, sql: null, error: lastMsg.text })
      }
    }
  }
}

async function reconnectSocket(token) {
  if (isReconnecting) return
  isReconnecting = true
  
  while (reconnectAttempts < CONFIG.socketOptions.reconnectionAttempts) {
    reconnectAttempts++
    console.log(`\n🔄 尝试重连 (${reconnectAttempts}/${CONFIG.socketOptions.reconnectionAttempts})...`)
    
    try {
      await new Promise((resolve, reject) => {
        socket = io(CONFIG.socketUrl, {
          ...CONFIG.socketOptions,
          auth: { Authorization: token },
        })
        
        socket.on('connect', () => {
          console.log('✓ 已重连')
          reconnectAttempts = 0
          reconnectDelay = 3000
          lastActivityTime = Date.now()  // 更新活动时间
          socket.emit('webviewMessage', { type: 'webviewDidLaunch' })
          startHeartbeat()  // 重连成功后重启心跳
          // 如果有正在进行的任务且未收到 completion_result，继续等待
          if (resolveCurrentTask && currentTaskId && !hasCompletionResult) {
            console.log(`  ✓ 重连成功，继续等待任务完成 (task_id: ${currentTaskId})`)
            console.log(`  ⏳ 任务可能仍在服务器端运行，等待 completion_result...`)
          }
          resolve(socket)
        })
        
        socket.on('connect_error', (error) => {
          console.log(`  连接失败: ${error.message}`)
          socket.disconnect()
          reject(error)
        })
        
        socket.on('disconnect', (reason) => {
          console.log(`  断开: ${reason}`)
        })
        
        socket.on('webviewMessage', handleServerMessage)
        socket.connect()
      })
      
      isReconnecting = false
      return true
    } catch (error) {
      console.log(`  等待 ${reconnectDelay}ms 后重试...`)
      await delay(reconnectDelay)
      reconnectDelay = Math.min(reconnectDelay * 2, 10000)
    }
  }
  
  isReconnecting = false
  return false
}

// ==================== 单问题查询 ====================

async function ensureDatasource(token, item) {
  const instanceId = item.instance_id
  
  // 加载该问题的数据源配置
  const configMap = loadDatasourceConfig()
  // 更新全局配置映射，以便 buildPrompt 可以使用
  datasourceConfigMap = configMap
  const config = configMap[instanceId]
  
  if (!config) {
    console.log(`  ⚠️ 未找到问题 ${instanceId} 的数据源配置`)
    return false
  }
  
  // 使用 config.name (dbId + schema) 作为数据源名称，与 createDatasource 中生成的一致
  const datasourceName = config.name  // dbId + schema
  const dbName = config.original_db_id  // 仅数据库名（用于向后兼容）
  
  // 先检查本地映射中是否已有该数据源（使用 dbId + schema）
  if (datasourceIdMap[datasourceName] && datasourceIdMap[datasourceName] !== 'EXISTS') {
    console.log(`  ✓ 数据源 "${datasourceName}" 已在本地映射中，跳过创建`)
    return true
  }
  
  // 也检查仅数据库名的映射（向后兼容）
  if (datasourceIdMap[dbName] && datasourceIdMap[dbName] !== 'EXISTS') {
    console.log(`  ✓ 数据源 "${dbName}" 已在本地映射中（向后兼容），跳过创建`)
    // 同时保存到新的 key
    datasourceIdMap[datasourceName] = datasourceIdMap[dbName]
    saveProgress({ completed: [], failed: [], datasourceMap: datasourceIdMap })
    return true
  }
  
  // 如果本地映射中没有，尝试创建数据源
  console.log(`  🔧 正在创建数据源 "${datasourceName}" (数据库: ${dbName}, Schema: ${config.main_schema})...`)
  
  const dsId = await createDatasource(token, config)
  
  if (dsId && dsId !== 'EXISTS') {
    // 同时保存到两个 key：新的 (dbId + schema) 和旧的 (仅 dbId) 以便向后兼容
    datasourceIdMap[datasourceName] = dsId
    datasourceIdMap[dbName] = dsId
    saveProgress({ completed: [], failed: [], datasourceMap: datasourceIdMap })
    console.log(`  ✓ 数据源创建成功`)
    return true
  } else if (dsId === 'EXISTS') {
    // 数据源已存在，标记为 EXISTS 并保存
    datasourceIdMap[datasourceName] = 'EXISTS'
    datasourceIdMap[dbName] = 'EXISTS'
    saveProgress({ completed: [], failed: [], datasourceMap: datasourceIdMap })
    console.log(`  ⚠️ 数据源已存在，使用已有配置`)
    return true
  }
  
  console.log(`  ✗ 数据源创建失败`)
  return false
}

async function queryOne(item, token) {
  const instanceId = item.instance_id
  const isTested = getTestedIds().has(instanceId)
  
  console.log(`\n📋 已选择: ${instanceId} ${isTested ? '✅' : ''}`)
  console.log(`   数据源: ${item.db_id}`)
  
  // 自动配置数据源
  console.log(`\n🔍 检查数据源配置...`)
  const dsReady = await ensureDatasource(token, item)
  if (!dsReady) {
    console.log(`\n❌ 数据源配置失败，无法继续查询`)
    return
  }
  
  console.log(`\n问题: ${item.instruction}`)
  console.log('')
  
  // 确保 datasourceConfigMap 已加载（用于 buildPrompt）
  if (Object.keys(datasourceConfigMap).length === 0) {
    datasourceConfigMap = loadDatasourceConfig()
  }
  
  // 构建 prompt
  const prompt = buildPrompt(item)
  
  console.log('🚀 发送查询到 AI Gateway...')
  
  // 发送任务并等待响应（使用较短的 WebSocket 等待超时）
  const response = await sendTaskSimple(prompt, CONFIG.websocketWaitTimeout)
  
  // 输出任务 ID（在 sendTaskSimple 中已生成）
  if (currentTaskId) {
    console.log(`   任务 ID: ${currentTaskId}`)
  }
  
  // 处理响应（可能是字符串或对象）
  let responseText = ''
  let isIncomplete = false
  
  if (typeof response === 'string') {
    responseText = response
  } else if (response && typeof response === 'object') {
    if (response.incomplete) {
      isIncomplete = true
      responseText = response.response || ''
    } else {
      responseText = response.fullResponse || response.text || ''
    }
  }
  
  // 提取文件
  const files = extractFiles(responseText)
  
  // 如果已收到完成消息（hasCompletionResult = true），即使没有提取到文件，也认为任务已完成
  // 因为 Web 端可能已经生成了文件，只是没有在 WebSocket 消息中返回完整内容
  if (hasCompletionResult && !isIncomplete) {
    console.log(`\n✅ 任务已完成（已收到完成消息）`)
    if (files.sql) {
      const sqlContent = typeof files.sql === 'string' ? files.sql : String(files.sql)
      console.log(`  📄 SQL: ${sqlContent.length} 字符（未保存，请手动从 Web 端复制）`)
    } else {
      console.log(`  ⚠️ 未提取到 SQL 内容，请从 Web 端手动复制`)
    }
    if (files.csv) {
      const csvContent = typeof files.csv === 'string' ? files.csv : String(files.csv)
      console.log(`  📄 CSV: ${csvContent.length} 字符（未保存，请手动从 Web 端复制）`)
    } else {
      console.log(`  ⚠️ 未提取到 CSV 内容，请从 Web 端手动复制`)
    }
    // 重置标志
    hasCompletionResult = false
    return
  }
  
  // 如果 WebSocket 未返回完整响应或连接断开
  if (isIncomplete || (!files.sql && !files.csv)) {
    console.log(`\n⚠️ WebSocket 未返回完整响应`)
    if (currentTaskId) {
      console.log(`   任务 ID: ${currentTaskId}`)
      console.log(`   请检查 Web 端任务状态，或稍后重试`)
    } else {
      console.log(`   未获取到 task_id，请检查 Web 端任务状态`)
    }
  } else {
    // WebSocket 已返回完整响应
    console.log(`\n✓ WebSocket 已确认任务完成`)
  }
  
  // 保存文件
  if (files.sql) {
    // 暂时禁用自动保存，用户手动从 Web 端复制
    const sqlContent = typeof files.sql === 'string' ? files.sql : String(files.sql)
    console.log(`\n📄 提取到 SQL: ${sqlContent.length} 字符（未保存，请手动从 Web 端复制）`)
  } else {
    console.log('\n⚠️ 未能提取 SQL')
  }
  
  if (files.csv) {
    const csvContent = typeof files.csv === 'string' ? files.csv : String(files.csv)
    console.log(`📄 提取到 CSV: ${csvContent.length} 字符（未保存，请手动从 Web 端复制）`)
  }
  
  console.log('\n' + '═'.repeat(48))
}

function sendTaskSimple(prompt, waitTimeout = CONFIG.websocketWaitTimeout) {
  return new Promise((resolve) => {
    accumulatedResponse = ''
    partialResponse = ''
    hasCompletionResult = false  // 重置标记
    resolveCurrentTask = resolve
    
    // 生成 task_id（使用时间戳）
    currentTaskId = Date.now()
    console.log(`   任务 ID: ${currentTaskId}`)
    
    // 保存 timeout ID，以便在收到 completion_result 时清除
    let timeoutId = null
    
    // 使用 WebSocket 等待超时
    timeoutId = setTimeout(() => {
      // 超时时检查是否收到 completion_result
      if (hasCompletionResult) {
        // 已经收到完整结果，使用完整响应
        resolve(accumulatedResponse || partialResponse || '')
      } else {
        // 未收到完整结果，标记为不完整
        console.log(`\n⏰ WebSocket 等待超时（${waitTimeout / 1000} 秒），未收到完整响应`)
        resolve({ incomplete: true, response: partialResponse || accumulatedResponse || '' })
      }
      timeoutId = null
    }, waitTimeout)
    
    // 保存 timeout ID 到全局变量，以便在收到 completion_result 时清除
    taskTimeout = timeoutId
    
    socket.emit('webviewMessage', { type: 'newTask', text: prompt })
    console.log(`等待 AI 响应...（最多等待 ${waitTimeout / 1000} 秒）`)
  })
}

// ==================== 任务处理 ====================

let hasCompletionResult = false  // 标记是否收到 completion_result

// 全局进度提示定时器（用于 sendTask）
let currentProgressTimer = null

function sendTask(item) {
  return new Promise((resolve) => {
    // 检查是否已有任务正在处理（这在顺序批量处理中不应该发生，但作为安全措施保留）
    if (resolveCurrentTask && currentTaskId) {
      console.log(`  ⚠️ 警告：检测到上一个任务未完成（task_id: ${currentTaskId}）`)
      console.log(`  ⚠️ 这是异常情况，在顺序批量处理中不应该发生`)
      console.log(`  ⚠️ 等待上一个任务完成后再继续...`)
      
      // 等待上一个任务完成（最多等待超时时间）
      const waitStartTime = Date.now()
      const maxWaitTime = CONFIG.timeout + 10000 // 额外等待10秒作为缓冲
      
      const checkInterval = setInterval(() => {
        // 如果上一个任务已完成（resolveCurrentTask 已清空），继续发送新任务
        if (!resolveCurrentTask) {
          clearInterval(checkInterval)
          console.log(`  ✓ 上一个任务已完成，继续发送新任务`)
          sendNewTask()
        } else if (Date.now() - waitStartTime > maxWaitTime) {
          // 等待超时，记录警告但继续（避免永远阻塞）
          clearInterval(checkInterval)
          console.log(`  ⚠️ 等待上一个任务超时，强制继续（可能导致任务冲突）`)
          // 清理上一个任务的状态
          if (taskTimeout) {
            clearTimeout(taskTimeout)
            taskTimeout = null
          }
          if (currentProgressTimer) {
            clearInterval(currentProgressTimer)
            currentProgressTimer = null
          }
          const oldResolve = resolveCurrentTask
          resolveCurrentTask = null
          oldResolve({ sql: null, csv: null, incomplete: true, replaced: true })
          // 等待一小段时间后继续
          setTimeout(() => {
            sendNewTask()
          }, 1000)
        }
      }, 1000) // 每秒检查一次
    } else {
      // 直接发送新任务（正常情况）
      sendNewTask()
    }
    
    function sendNewTask() {
      accumulatedResponse = ''
      partialResponse = ''
      hasCompletionResult = false  // 重置标记
      resolveCurrentTask = resolve
      
      // 生成 task_id（使用时间戳）
      currentTaskId = Date.now()
      
      // 清除之前的进度提示定时器（如果有）
      if (currentProgressTimer) {
        clearInterval(currentProgressTimer)
        currentProgressTimer = null
      }
      
      // 添加进度提示定时器（每 2 分钟提示一次）
      let elapsedMinutes = 0
      const progressInterval = 120000 // 2 分钟
      
      currentProgressTimer = setInterval(() => {
        elapsedMinutes += 2
        if (elapsedMinutes <= 20) {
          console.log(`\n⏳ 处理中... 已等待 ${elapsedMinutes} 分钟（超时时间: ${Math.floor(CONFIG.timeout / 60000)} 分钟）`)
        }
      }, progressInterval)
      
      taskTimeout = setTimeout(() => {
        // 清除进度提示定时器
        if (currentProgressTimer) {
          clearInterval(currentProgressTimer)
          currentProgressTimer = null
        }
        // 超时时检查是否收到 completion_result
        if (hasCompletionResult) {
          // 已经收到完整结果，忽略超时
          taskTimeout = null
          return
        }
        // 未收到完整结果，标记为不完整
        if (resolveCurrentTask === resolve) {
          resolveCurrentTask = null
          taskTimeout = null
        }
        console.log(`\n⏰ 已等待 ${Math.floor(CONFIG.timeout / 60000)} 分钟，超时`)
        resolve({ sql: null, csv: null, incomplete: true, timeout: true })
      }, CONFIG.timeout)
      
      const prompt = buildPrompt(item)
      socket.emit('webviewMessage', { type: 'newTask', text: prompt })
      console.log(`处理: ${item.instance_id} (${item.db_id})`)
      console.log(`任务 ID: ${currentTaskId}`)
    }
  })
}

function buildPrompt(item) {
  const instanceId = item.instance_id
  
  // 获取数据源名称列表（支持多数据源）
  const datasourceNames = []
  
  // 方式1: 从配置中获取主数据源（当前问题的数据源）
  const config = datasourceConfigMap[instanceId]
  if (config && config.name) {
    datasourceNames.push(config.name)
  } else if (item.db_id) {
    datasourceNames.push(item.db_id)
  }
  
  // 方式2: 如果问题数据中有多个数据源字段（db_ids 数组）
  if (item.db_ids && Array.isArray(item.db_ids)) {
    // 清空之前添加的，使用数组中的数据源
    datasourceNames.length = 0
    for (const dbId of item.db_ids) {
      // 尝试从配置中查找对应的数据源连接名称
      let found = false
      for (const [id, cfg] of Object.entries(datasourceConfigMap)) {
        if (cfg.original_db_id === dbId) {
          datasourceNames.push(cfg.name)
          found = true
          break
        }
      }
      // 如果配置中找不到，直接使用 db_id
      if (!found) {
        datasourceNames.push(dbId)
      }
    }
  }
  
  // 去重
  const uniqueDatasourceNames = [...new Set(datasourceNames)]
  
  // 构建数据源连接名称字符串
  let datasourceInfo = ''
  if (uniqueDatasourceNames.length === 0) {
    datasourceInfo = '数据源连接名称：未指定'
  } else if (uniqueDatasourceNames.length === 1) {
    datasourceInfo = `数据源连接名称：${uniqueDatasourceNames[0]}`
  } else {
    // 多个数据源，每行一个
    datasourceInfo = `数据源连接名称：\n${uniqueDatasourceNames.map((name, idx) => `  ${idx + 1}. ${name}`).join('\n')}`
  }
  
  // 从数据源名称提取database和schema信息（用于生成schema路径示例）
  // 格式：DATABASE_SCHEMA -> database="DATABASE", schema="SCHEMA"
  // 常见格式：DEPS_DEV_V1_DEPS_DEV_V1 -> database="DEPS_DEV_V1", schema="DEPS_DEV_V1"
  function parseDatasourceName(dsName) {
    if (!dsName) return null
    const parts = dsName.split('_')
    
    // 处理重复格式：如 DEPS_DEV_V1_DEPS_DEV_V1
    if (parts.length >= 4) {
      // 尝试找到重复的部分
      for (let i = 1; i < parts.length; i++) {
        const firstPart = parts.slice(0, i).join('_')
        const secondPart = parts.slice(i).join('_')
        if (firstPart === secondPart) {
          return { database: firstPart, schema: firstPart }
        }
      }
    }
    
    // 处理 DATABASE_SCHEMA 格式（假设中间位置分割）
    if (parts.length >= 2) {
      // 尝试多种分割方式
      // 方式1：前半部分作为database，后半部分作为schema
      const mid = Math.floor(parts.length / 2)
      const database = parts.slice(0, mid).join('_')
      const schema = parts.slice(mid).join('_')
      
      // 如果database和schema相同，说明可能是重复格式但未完全匹配
      if (database === schema) {
        return { database, schema }
      }
      
      // 如果不同，返回分割结果
      return { database, schema }
    }
    
    // 如果无法解析，假设整个名称既是database也是schema
    return { database: dsName, schema: dsName }
  }
  
  // 获取第一个数据源的schema信息（用于示例）
  const firstDsName = uniqueDatasourceNames[0]
  const schemaInfo = firstDsName ? parseDatasourceName(firstDsName) : null
  const schemaExample = schemaInfo 
    ? `"${schemaInfo.database}"."${schemaInfo.schema}"."TABLE_NAME"`
    : `"DATABASE"."SCHEMA"."TABLE_NAME"`
  
  // 构建SQL编写规范指导
  const sqlGuidelines = `
## SQL编写规范（必须严格遵守）：

**重要：这是Snowflake数据仓库，必须使用Snowflake SQL语法。**

### 1. Schema路径（必须）
- 所有表引用必须使用完整的三级路径："DATABASE"."SCHEMA"."TABLE"
- 数据源连接名称格式为 "DATABASE_SCHEMA" 时，转换为 "DATABASE"."SCHEMA"."TABLE"
- 示例：数据源 "${firstDsName || 'DATABASE_SCHEMA'}" → 使用 ${schemaExample}
- 重要：不要省略database和schema，必须使用完整路径

### 2. SQL语法（必须使用Snowflake SQL语法）
- 数据库类型：这是Snowflake数据仓库，必须使用Snowflake原生SQL语法
- 日期时间：使用 TO_TIMESTAMP_NTZ(...) 而不是 TO_TIMESTAMP(...)（Snowflake推荐使用NTZ无时区类型）
- JSON处理：使用 PARSE_JSON(column):"key" 而不是 JSON_EXTRACT_PATH_TEXT(...)（Snowflake推荐语法）
- 数组访问：直接使用 array[0]::STRING 而不是 ARRAY_CONTAINS(...)（Snowflake数组索引语法）
- 窗口函数过滤：使用 QUALIFY ROW_NUMBER() OVER (...) = 1 简化代码（Snowflake特有QUALIFY子句）
- 日期范围：使用 >= 'start' AND < 'end' 而不是 BETWEEN 'start' AND 'end'（更明确，避免边界问题）
- 嵌套数据展开：使用 LATERAL FLATTEN(input => column) 处理JSON数组和嵌套结构（Snowflake特有语法）
- 类型转换：使用 ::TYPE 语法（如 ::STRING, ::INTEGER, ::BOOLEAN）而不是 CAST(...)

### 3. 查询逻辑（必须）
- 版本选择：如果查询"最新版本"或"release版本"，必须检查 COALESCE((pv."VersionInfo":"IsRelease")::BOOLEAN, FALSE) 只选择release版本
- 最新记录：使用 QUALIFY ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ... DESC) = 1 而不是子查询
- 计数字段：理解业务含义，选择正确的计数字段（如ForumMessageId而不是Id，按消息计数而不是按记录计数）
- 相似性：如果数据中有embedding字段，使用向量点积计算相似度：SUM(embedding1.value * embedding2.value)

### 4. 数据过滤（必须）
- 添加NULL检查：WHERE column IS NOT NULL（特别是外键和关键字段）
- 排除自引用：如 WHERE from_id != to_id（避免自己给自己投票等情况）
- 状态检查：添加必要的状态过滤（如 status = 'Complete'）
- 日期过滤：使用 >= 和 < 而不是 BETWEEN

### 5. 排序和限制（必须）
- 添加次要排序字段：ORDER BY primary DESC, secondary ASC（确保结果稳定）
- LIMIT数量必须与问题要求一致（仔细检查问题中的数量要求）
- 使用明确的排序方向（ASC/DESC）

### 6. 输出格式
- SQL文件：只包含SQL语句，不要包含注释（除非必要）
- CSV文件：包含查询结果的CSV格式数据，包含表头
- 字段名使用驼峰式命名（如 "GiverUserName"）或下划线命名（如 "giver_username"），保持一致性
- 字段别名使用双引号：AS "FieldName"
`
  
  let prompt = `${instanceId}
${datasourceInfo}
${item.instruction}

${sqlGuidelines}

生成两个文件：
1. CSV 文件 (${instanceId}.csv): 问题答案（CSV格式，包含表头）
2. SQL 文件 (${instanceId}.sql): 完整的sql语句（必须符合上述SQL编写规范，特别是schema路径必须完整）
`
  
  return prompt
}

async function ensureDatasourceForBatch(token, instanceId, dbId) {
  // 加载数据源配置
  const configMap = loadDatasourceConfig()
  // 更新全局配置映射，以便 buildPrompt 可以使用
  datasourceConfigMap = configMap
  const config = configMap[instanceId]
  
  if (!config) {
    return false
  }
  
  // 使用 config.name (dbId + schema) 作为数据源名称，与 createDatasource 中生成的一致
  const datasourceName = config.name  // dbId + schema
  const dbNameOnly = dbId  // 仅数据库名（用于向后兼容）
  
  // 如果数据源已在 map 中且有有效 ID，跳过创建（先检查新的 key）
  if (datasourceIdMap[datasourceName] && datasourceIdMap[datasourceName] !== 'EXISTS') {
    return true
  }
  
  // 也检查仅数据库名的映射（向后兼容）
  if (datasourceIdMap[dbNameOnly] && datasourceIdMap[dbNameOnly] !== 'EXISTS') {
    // 同时保存到新的 key
    datasourceIdMap[datasourceName] = datasourceIdMap[dbNameOnly]
    saveProgress({ completed: [], failed: [], datasourceMap: datasourceIdMap })
    return true
  }
  
  // 创建数据源
  console.log(`  🔧 正在创建数据源 "${datasourceName}" (数据库: ${dbNameOnly}, Schema: ${config.main_schema})...`)
  const dsId = await createDatasource(token, config)
  
  if (dsId && dsId !== 'EXISTS') {
    // 同时保存到两个 key：新的 (dbId + schema) 和旧的 (仅 dbId) 以便向后兼容
    datasourceIdMap[datasourceName] = dsId
    datasourceIdMap[dbNameOnly] = dsId
    saveProgress({ completed: [], failed: [], datasourceMap: datasourceIdMap })
    console.log(`  ✓ 数据源创建成功`)
    return true
  } else if (dsId === 'EXISTS') {
    // 数据源已存在
    console.log(`  ⚠️ 数据源已存在，使用已有配置`)
    datasourceIdMap[datasourceName] = 'EXISTS'
    datasourceIdMap[dbNameOnly] = 'EXISTS'
    return true
  }
  
  console.log(`  ✗ 数据源创建失败`)
  return false
}

async function processTask(item, progress, token) {
  const instanceId = item.instance_id
  const taskStartTime = Date.now()  // 记录任务开始时间
  
  // 根据问题找到对应的数据源配置
  const config = datasourceConfigMap[instanceId]
  // 使用真实数据库名查找（与 setupDatasources 中保存的 key 一致）
  const datasourceName = config ? config.original_db_id : item.db_id
  
  console.log(`[${stats.processed + 1}/${stats.total}] ${instanceId}`)
  console.log(`数据源: ${datasourceName}`)
  console.log(`问题: ${item.instruction.substring(0, 60)}...`)
  console.log(`⏰ 开始时间: ${new Date().toLocaleString('zh-CN')}`)
  
  // 检查数据源是否已配置，如果未配置则自动创建
  if (!datasourceIdMap[datasourceName]) {
    console.log(`  ⚠️ 数据源 "${datasourceName}" 未配置，自动创建中...`)
    const dsReady = await ensureDatasourceForBatch(token, instanceId, datasourceName)
    if (!dsReady) {
      const taskDuration = Date.now() - taskStartTime
      console.log(`  ⏱️ 任务耗时: ${formatDuration(taskDuration)}`)
      progress.failed.push(instanceId)
      // 保存任务时间到 progress
      if (!progress.taskTimes) {
        progress.taskTimes = {}
      }
      progress.taskTimes[instanceId] = {
        duration: taskDuration,
        durationFormatted: formatDuration(taskDuration),
        startTime: new Date(taskStartTime).toISOString(),
        endTime: new Date().toISOString(),
        status: 'failed',
        error: '数据源创建失败'
      }
      saveProgress(progress)
      stats.failed++
      return { success: false, duration: taskDuration }
    }
  }
  
  // 如果 socket 已断开，尝试重连
  if (!socket || !socket.connected) {
    console.log(`  🔄 WebSocket 已断开，正在重新连接...`)
    const reconnected = await reconnectSocket(token)
    if (!reconnected) {
      console.log(`  ⚠️ 重连失败，任务状态未知`)
      // 即使重连失败，也继续发送任务
    } else {
      console.log(`  ✓ 重连成功`)
      await delay(500)  // 重连后等待一段时间确保连接稳定
    }
  }
  
  // 确保在发送任务前，datasourceConfigMap 已更新
  if (Object.keys(datasourceConfigMap).length === 0) {
    datasourceConfigMap = loadDatasourceConfig()
  }
  
  const response = await sendTask(item)
  console.log('')
  
  // 情况0: 如果已收到完成消息（hasCompletionResult = true），直接认为任务已完成
  // 因为 Web 端已经发送了 completion_result，说明任务已经完成
  // sendTask() 会在收到 completion_result 时 resolve，此时 hasCompletionResult 应该为 true
  if (hasCompletionResult) {
    console.log(`\n✅ 任务已完成（已收到 completion_result 消息）`)
    // 尝试提取文件（如果有）
    let files = { sql: '', csv: '' }
    if (response && typeof response === 'string') {
      files = extractFiles(response)
    } else if (response && typeof response === 'object' && response.fullResponse) {
      files = extractFiles(response.fullResponse)
    }
    
    if (files.sql) {
      const sqlContent = typeof files.sql === 'string' ? files.sql : String(files.sql)
      console.log(`  📄 SQL: ${sqlContent.length} 字符（未保存，请手动从 Web 端复制）`)
    }
    if (files.csv) {
      const csvContent = typeof files.csv === 'string' ? files.csv : String(files.csv)
      console.log(`  📄 CSV: ${csvContent.length} 字符（未保存，请手动从 Web 端复制）`)
    }
    
    // 重置标志
    hasCompletionResult = false
    const taskDuration = Date.now() - taskStartTime
    console.log(`  ⏱️ 任务耗时: ${formatDuration(taskDuration)}`)
    progress.completed.push(instanceId)
    // 保存任务时间到 progress
    if (!progress.taskTimes) {
      progress.taskTimes = {}
    }
    progress.taskTimes[instanceId] = {
      duration: taskDuration,
      durationFormatted: formatDuration(taskDuration),
      startTime: new Date(taskStartTime).toISOString(),
      endTime: new Date().toISOString(),
      status: 'success'
    }
    saveProgress(progress)
    stats.success++
    return { success: true, confirmedByCompletionMessage: true, duration: taskDuration }
  }
  
  // 情况1: WebSocket 返回了完整响应（有 SQL 或 CSV），任务已完成
  if (response && response.sql) {
    // 任务已完成，标记为成功
    const sqlContent = typeof response.sql === 'string' ? response.sql : String(response.sql)
    console.log(`  📄 提取到 SQL: ${sqlContent.length} 字符（未保存，请手动从 Web 端复制）`)
    
    if (response.csv) {
      const csvContent = typeof response.csv === 'string' ? response.csv : String(response.csv)
      console.log(`  📄 提取到 CSV: ${csvContent.length} 字符（未保存，请手动从 Web 端复制）`)
    } else {
      console.log(`  ⚠️ 未提取到 CSV 内容`)
    }
    
    const taskDuration = Date.now() - taskStartTime
    console.log(`  ⏱️ 任务耗时: ${formatDuration(taskDuration)}`)
    progress.completed.push(instanceId)
    // 保存任务时间到 progress
    if (!progress.taskTimes) {
      progress.taskTimes = {}
    }
    progress.taskTimes[instanceId] = {
      duration: taskDuration,
      durationFormatted: formatDuration(taskDuration),
      startTime: new Date(taskStartTime).toISOString(),
      endTime: new Date().toISOString(),
      status: 'success'
    }
    saveProgress(progress)
    stats.success++
    return { success: true, duration: taskDuration }
  }
  
  // 情况2: WebSocket 返回了响应但内容不完整，或连接断开
  if (response && (response.incomplete || !response.sql || response.disconnected)) {
    if (response.disconnected) {
      console.log(`\n⚠️ WebSocket 连接断开，任务状态未知`)
    } else {
      console.log(`\n⚠️ WebSocket 未返回完整响应，任务状态未知`)
    }
    // 如果连接断开，尝试重连后继续
    if (response.disconnected && (!socket || !socket.connected)) {
      console.log(`  🔄 尝试重新连接...`)
      const reconnected = await reconnectSocket(token)
      if (reconnected) {
        console.log(`  ✓ 重连成功，但任务状态未知，标记为不完整`)
      }
    }
    // 标记为不完整，继续处理下一个任务
    const taskDuration = Date.now() - taskStartTime
    console.log(`  ⏱️ 任务耗时: ${formatDuration(taskDuration)}`)
    // 保存任务时间到 progress（即使不完整也记录）
    if (!progress.taskTimes) {
      progress.taskTimes = {}
    }
    progress.taskTimes[instanceId] = {
      duration: taskDuration,
      durationFormatted: formatDuration(taskDuration),
      startTime: new Date(taskStartTime).toISOString(),
      endTime: new Date().toISOString(),
      status: 'incomplete'
    }
    saveProgress(progress)
    return { success: false, incomplete: true, duration: taskDuration }
  }
  
  // 情况3: 未收到任何响应，可能是连接断开导致
  if (!response) {
    console.log(`  ⚠️ 未收到响应`)
    // 如果没有 task_id，说明任务可能未发送成功，但不重试（避免创建重复任务）
    if (!currentTaskId) {
      console.log(`  ⚠️ 未获取到 task_id，任务可能未发送成功，跳过此任务（避免创建重复任务）`)
      return { success: false, skipped: true }
    }
    // 如果有 task_id 但未收到响应，标记为不完整
    console.log(`  ⚠️ 任务已发送但未收到响应，标记为不完整`)
    const taskDuration = Date.now() - taskStartTime
    console.log(`  ⏱️ 任务耗时: ${formatDuration(taskDuration)}`)
    // 保存任务时间到 progress
    if (!progress.taskTimes) {
      progress.taskTimes = {}
    }
    progress.taskTimes[instanceId] = {
      duration: taskDuration,
      durationFormatted: formatDuration(taskDuration),
      startTime: new Date(taskStartTime).toISOString(),
      endTime: new Date().toISOString(),
      status: 'incomplete'
    }
    saveProgress(progress)
    return { success: false, incomplete: true, duration: taskDuration }
  }
  
  // 情况4: 检查是否是不完整响应（超时但未收到 completion_result）
  if (response && response.incomplete) {
    if (response.disconnected) {
      console.log(`  ⚠️ 连接断开，任务未完成，继续下一个问题`)
    } else {
      console.log(`  ⚠️ 内容不完整（超时），不保存文件，标记为 incomplete`)
    }
    // 不保存文件，不标记为完成或失败
    // 任务会在重试时重新处理（使用 --resume）
    // 但继续处理下一个问题，不阻塞批量处理
    return { success: false, incomplete: true }
  }
  
  // 其他情况：标记为失败
  console.log(`  ✗ 未知错误，标记为失败`)
  const taskDuration = Date.now() - taskStartTime
  console.log(`  ⏱️ 任务耗时: ${formatDuration(taskDuration)}`)
  // 保存任务时间到 progress
  if (!progress.taskTimes) {
    progress.taskTimes = {}
  }
  progress.taskTimes[instanceId] = {
    duration: taskDuration,
    durationFormatted: formatDuration(taskDuration),
    startTime: new Date(taskStartTime).toISOString(),
    endTime: new Date().toISOString(),
    status: 'failed'
  }
  saveProgress(progress)
  return { success: false, duration: taskDuration }
}

// ==================== 主程序 ====================

async function main() {
  console.log('╔══════════════════════════════════════╗')
  console.log('║    Infinisql Generator               ║')
  console.log('╚══════════════════════════════════════╝')
  console.log('')
  
  const options = parseArgs()
  
  if (!options.token) {
    console.error('请提供 JWT Token')
    console.log('  export AI_GATEWAY_TOKEN="your-token"')
    console.log('  node infinisql_client.js')
    process.exit(1)
  }
  
  // 读取数据集
  let items
  try {
    items = await readJSONL(CONFIG.inputFile)
    console.log(`📂 已加载 ${items.length} 个问题`)
  } catch (error) {
    console.error(`读取失败: ${error.message}`)
    process.exit(1)
  }
  
  // 加载数据源配置（用于 buildPrompt）
  datasourceConfigMap = loadDatasourceConfig()
  
  // 检测已测试问题
  const testedIds = getTestedIds()
  
  // 显示已测试列表
  if (options.tested) {
    const testedArray = Array.from(testedIds).sort()
    console.log('\n✅ 已测试的问题:')
    console.log('─'.repeat(60))
    if (testedArray.length === 0) {
      console.log('   暂无')
    } else {
      testedArray.forEach((id, idx) => {
        console.log(`   ${(idx + 1).toString().padStart(2)}. ${id}`)
      })
    }
    console.log('─'.repeat(60))
    console.log(`   共 ${testedArray.length} 个问题已测试`)
    process.exit(0)
  }
  
  // 显示进度统计
  if (options.stats) {
    displayStats(items, testedIds)
    process.exit(0)
  }
  
  // 列出所有问题
  if (options.list) {
    listQuestions(items, testedIds)
    process.exit(0)
  }
  
  // 显示数据源配置模板
  if (options.showConfig) {
    generateDatasourceConfigTemplate()
    process.exit(0)
  }
  
  // 列出数据源
  if (options.listDs) {
    await listDatasources(options.token)
    process.exit(0)
  }
  
  // 清理所有本地映射（数据源+知识库）
  if (options.resetAll) {
    console.log('\n🗑️ 清理所有本地映射...')
    
    // 清理数据源映射
    datasourceIdMap = {}
    const savedProgress = loadProgress()
    savedProgress.datasourceMap = {}
    fs.writeFileSync(CONFIG.progressFile, JSON.stringify(savedProgress, null, 2))
    console.log('  ✓ 已清理 progress.json 中的数据源映射')
    
    // 清理知识库映射
    saveKnowledgeMap({})
    console.log('  ✓ 已清理 knowledge_map.json 中的知识库映射')
    
    console.log('\n✅ 所有本地映射已清理完成！')
    console.log('   现在可以重新创建数据源和知识库：')
    console.log('   1. node infinisql_client.js --setup --token YOUR_TOKEN')
    console.log('   2. node infinisql_client.js --setup-kb --token YOUR_TOKEN')
    process.exit(0)
  }
  
// 设置数据源（自动创建）
  if (options.setup) {
    console.log('\n🔧 开始设置数据源...')
    
    // 自动清理数据源映射（重建模式）
    console.log('🗑️ 清理本地数据源映射...')
    datasourceIdMap = {}
    const savedProgress = loadProgress()
    savedProgress.datasourceMap = {}
    fs.writeFileSync(CONFIG.progressFile, JSON.stringify(savedProgress, null, 2))
    console.log('  ✓ 已清理 progress.json 中的数据源映射\n')
    
    const newDatasourceMap = await setupDatasources(options.token)
    
    // 保存数据源映射
    if (Object.keys(newDatasourceMap).length > 0) {
      datasourceIdMap = newDatasourceMap
      saveProgress({ completed: [], failed: [], datasourceMap: newDatasourceMap })
      console.log('\n✓ 数据源设置完成，已保存到 progress.json')
    }
    process.exit(0)
  }
  
  // 创建单个数据源
  if (options.createDs) {
    const instanceId = options.createDsId
    if (!instanceId) {
      console.error('错误: 请指定 instance_id')
      console.log('  用法: node infinisql_client.js --create-ds <instance_id>')
      process.exit(1)
    }
    
    // 加载数据源配置
    const configMap = loadDatasourceConfig()
    const config = configMap[instanceId]
    
    if (!config) {
      console.error(`错误: 未找到 ${instanceId} 的数据源配置`)
      console.log('  请检查 snowflake_database_setting.json 文件')
      process.exit(1)
    }
    
    console.log(`\n🔧 创建数据源: ${instanceId}`)
    console.log(`  数据库: ${config.original_db_id}`)
    console.log(`  Schema: ${config.main_schema || 'PUBLIC'}`)
    
    const dsId = await createDatasource(options.token, config)
    
    if (dsId) {
      // 保存到 progress.json
      const savedProgress = loadProgress()
      savedProgress.datasourceMap = savedProgress.datasourceMap || {}
      savedProgress.datasourceMap[config.original_db_id] = dsId
      fs.writeFileSync(CONFIG.progressFile, JSON.stringify(savedProgress, null, 2))
      console.log(`\n✓ 数据源创建成功，已保存到 progress.json`)
    } else if (dsId === 'EXISTS') {
      console.log(`\n⚠️ 数据源已存在`)
    } else {
      console.log(`\n❌ 数据源创建失败`)
    }
    process.exit(0)
  }
  
  // 一键创建所有知识库
  if (options.setupKb) {
    console.log('\n🚀 开始创建所有知识库...')
    
    // 自动清理知识库映射（重建模式）
    console.log('🗑️ 清理本地知识库映射...')
    saveKnowledgeMap({})
    console.log('  ✓ 已清理 knowledge_map.json 中的知识库映射\n')
    
    // 加载数据源映射
    const savedProgress = loadProgress()
    if (savedProgress.datasourceMap) {
      datasourceIdMap = savedProgress.datasourceMap
    }
    
    await setupAllKnowledgeBases(options.token)
    process.exit(0)
  }
  
  // 创建单个知识库并上传文件
  if (options.createKb) {
    const instanceId = options.createKbId
    if (!instanceId) {
      console.error('错误: 请指定 instance_id')
      console.log('  用法: node infinisql_client.js --create-kb <instance_id>')
      process.exit(1)
    }
    
    // 加载数据源映射
    const savedProgress = loadProgress()
    if (savedProgress.datasourceMap) {
      datasourceIdMap = savedProgress.datasourceMap
    }
    
    await createKnowledge(options.token, instanceId)
    process.exit(0)
  }
  
  // 上传文件到现有知识库
  if (options.uploadKb) {
    if (!options.uploadKbId || !options.uploadFilename) {
      console.error('错误: 请指定知识库 ID 和文件名')
      console.log('  用法: node infinisql_client.js --upload-kb <kb_id> <filename>')
      process.exit(1)
    }
    
    const success = await uploadToKnowledge(options.token, options.uploadKbId, options.uploadFilename)
    if (success) {
      console.log('\n✅ 文件上传成功')
    } else {
      console.log('\n❌ 文件上传失败')
    }
    process.exit(0)
  }
  
// 单问题查询
  if (options.one) {
    let item = null
    
    if (options.oneId) {
      item = items.find(i => i.instance_id === options.oneId)
    } else if (options.oneIndex !== null) {
      if (options.oneIndex < 0 || options.oneIndex >= items.length) {
        console.error(`错误: 序号 ${options.oneIndex} 超出范围 (0-${items.length - 1})`)
        process.exit(1)
      }
      item = items[options.oneIndex]
    } else if (options.oneRandom) {
      // 过滤已测试的问题
      const testedIds = getTestedIds()
      const untestedItems = items.filter(i => !testedIds.has(i.instance_id))
      
      if (untestedItems.length === 0) {
        console.error('\n❌ 没有可用的未测试问题')
        console.log(`   已测试的问题数量: ${testedIds.size}`)
        console.log(`   总问题数量: ${items.length}`)
        process.exit(1)
      }
      
      // 从未测试的问题中随机选择一个
      const randomIdx = Math.floor(Math.random() * untestedItems.length)
      item = untestedItems[randomIdx]
      
      if (testedIds.size > 0) {
        console.log(`\n🎲 随机模式：已过滤 ${testedIds.size} 个已测试问题，从 ${untestedItems.length} 个未测试问题中随机选择`)
      }
    } else {
      console.error('错误: 请指定 --id, --index 或 --random')
      showHelp()
      process.exit(1)
    }
    
    if (!item) {
      console.error('错误: 未找到指定的问题')
      process.exit(1)
    }
    
    // 处理 --reset-ds：清除该问题的数据源映射
    if (options.resetDs) {
      console.log('\n🗑️ 清除数据源映射（重新创建模式）')
      const datasourceName = item.db_id
      datasourceIdMap = {}
      const savedProgress = loadProgress()
      savedProgress.datasourceMap = savedProgress.datasourceMap || {}
      delete savedProgress.datasourceMap[datasourceName]
      datasourceIdMap = savedProgress.datasourceMap
      fs.writeFileSync(CONFIG.progressFile, JSON.stringify(savedProgress, null, 2))
    }
    
    ensureDirs()
    
    try {
      await initSocket(options.token)
      await queryOne(item, options.token)
    } catch (error) {
      console.error(`错误: ${error.message}`)
      process.exit(1)
    } finally {
      cleanupResources()
    }
    
    process.exit(0)
  }
  
  // 加载数据源配置
  datasourceConfigMap = loadDatasourceConfig()
  
  ensureDirs()
  
  // 读取已保存的进度和数据源映射
  let savedProgress = loadProgress()
  
  // 处理 --reset-ds 选项：清除所有数据源映射
  if (options.resetDs) {
    console.log('\n🗑️ 清除数据源映射（重新创建模式）')
    datasourceIdMap = {}
    // 重置 progress.json 中的数据源映射
    savedProgress.datasourceMap = {}
    fs.writeFileSync(CONFIG.progressFile, JSON.stringify(savedProgress, null, 2))
  } else {
    // 优先使用命令行参数指定的数据源映射，否则使用保存的
    if (Object.keys(datasourceIdMap).length === 0 && savedProgress.datasourceMap) {
      datasourceIdMap = savedProgress.datasourceMap
    }
  }
  
  const progress = {
    completed: savedProgress.completed || [],
    failed: savedProgress.failed || [],
    datasourceMap: datasourceIdMap,
  }
  
  if (options.idsFile) {
    const idsPath = path.isAbsolute(options.idsFile) ? options.idsFile : path.resolve(process.cwd(), options.idsFile)
    if (!fs.existsSync(idsPath)) {
      console.error('--ids-file 文件不存在: ' + idsPath)
      process.exit(1)
    }
    const raw = fs.readFileSync(idsPath, 'utf8')
    const ids = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    const itemMap = new Map(items.map(i => [i.instance_id, i]))
    items = ids.map(id => itemMap.get(id)).filter(Boolean)
    const missing = ids.filter(id => !itemMap.has(id))
    if (missing.length) console.log('⚠️ 以下 id 在 jsonl 中未找到，已跳过: ' + missing.join(', '))
    console.log('📋 从 --ids-file 加载 ' + ids.length + ' 个 id，将处理 ' + items.length + ' 个问题')
  } else if (options.resume) {
    const completedSet = new Set(progress.completed)
    items = items.filter(item => !completedSet.has(item.instance_id))
    console.log(`  过滤后: ${items.length} 个待处理`)
  }
  
  // 如果指定了 --random，先过滤已测试的问题，然后随机选择（--ids-file 时不再按 start/count/random 裁剪）
  if (!options.idsFile && options.random && options.count > 0) {
    const testedIds = getTestedIds()
    const beforeCount = items.length
    items = items.filter(item => !testedIds.has(item.instance_id))
    console.log(`\n🎲 随机模式：已过滤 ${testedIds.size} 个已测试问题，剩余 ${items.length} 个待选（共 ${beforeCount} 个问题）`)
    
    if (items.length === 0) {
      console.log('\n❌ 没有可用的未测试问题')
      process.exit(0)
    }
    
    if (items.length < options.count) {
      console.log(`\n⚠️ 可用问题数量 (${items.length}) 少于请求数量 (${options.count})，将处理所有可用问题`)
    }
    
    // Fisher-Yates 洗牌算法
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]]
    }
    
    // 选择前 n 个
    items = items.slice(0, Math.min(options.count, items.length))
    console.log(`\n✅ 已随机选择 ${items.length} 个问题：`)
    items.forEach((item, idx) => {
      console.log(`   ${idx + 1}. ${item.instance_id}`)
    })
  } else if (!options.idsFile) {
    // 非随机、非 ids-file：按 start/count 裁剪
    if (options.start > 0) items = items.slice(options.start)
    if (options.count > 0) items = items.slice(0, options.count)
  }
  
  stats.total = items.length
  stats.startTime = Date.now()
  
  if (items.length === 0) {
    console.log('\n没有待处理的任务')
    process.exit(0)
  }
  
  // 统计涉及的数据源
  const dbIds = [...new Set(items.map(item => item.db_id))]
  console.log(`\n📊 涉及 ${dbIds.length} 个数据源: ${dbIds.join(', ')}`)
  
  // 检查已配置的数据源
  const configuredDs = dbIds.filter(dbId => datasourceIdMap[dbId])
  const unconfiguredDs = dbIds.filter(dbId => !datasourceIdMap[dbId])
  
  if (configuredDs.length > 0) {
    console.log(`  ✓ 已配置: ${configuredDs.join(', ')}`)
  }
  if (unconfiguredDs.length > 0) {
    console.log(`  ✗ 未配置: ${unconfiguredDs.join(', ')}`)
    console.log(`\n💡 请先配置数据源 ID，运行: node infinisql_client.js --show-config`)
    console.log(`   然后编辑 progress.json，手动添加 datasourceMap 配置`)
  }
  
  console.log(`\n🚀 将处理 ${items.length} 个问题`)
  
  try {
    await initSocket(options.token)
  } catch (error) {
    logError('ERROR', '连接 AI Gateway 失败', error)
    cleanupResources()
    process.exit(1)
  }
  
  await delay(500)
  
  isProcessing = true
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    stats.processed++
    
    try {
      // 等待任务完成（processTask 会等待 sendTask，sendTask 会等待 completion_result）
      const taskStartTime = Date.now()  // 记录任务开始时间（批量处理层面）
      console.log(`\n${'='.repeat(60)}`)
      console.log(`开始处理任务 ${i + 1}/${items.length}: ${item.instance_id}`)
      console.log(`开始时间: ${new Date().toLocaleString('zh-CN')}`)
      console.log(`${'='.repeat(60)}`)
      
      const result = await processTask(item, progress, options.token)
      
      // 检查任务结果
      if (result && result.success) {
        if (result.confirmedByCompletionMessage) {
          console.log(`\n✅ 任务 ${item.instance_id} 处理完成（已收到 completion_result）`)
        } else {
          console.log(`\n✅ 任务 ${item.instance_id} 处理完成`)
        }
        if (result.duration) {
          console.log(`   ⏱️ 总耗时: ${formatDuration(result.duration)}`)
        }
      } else if (result && result.incomplete) {
        console.log(`\n⚠️ 任务 ${item.instance_id} 状态不完整，但继续处理下一个任务（Web 端可能已完成）`)
        if (result.duration) {
          console.log(`   ⏱️ 总耗时: ${formatDuration(result.duration)}`)
        }
      } else {
        console.log(`\n❌ 任务 ${item.instance_id} 处理失败`)
        if (result && result.duration) {
          console.log(`   ⏱️ 总耗时: ${formatDuration(result.duration)}`)
        }
      }
      
      // 任务完成后（已收到 completion_result），等待一段时间确保 Web 端完全处理完成
      // 然后再继续下一个任务（适配单进程 AI Gateway）
      if (i < items.length - 1) {
        console.log(`\n⏳ 任务 ${item.instance_id} 已完成，等待 ${CONFIG.requestDelay / 1000} 秒后继续下一个任务...`)
        await delay(CONFIG.requestDelay)
        
        // 显示下一个任务信息
        const nextItem = items[i + 1]
        console.log(`\n${'='.repeat(60)}`)
        console.log(`开始处理下一个任务 ${i + 2}/${items.length}: ${nextItem.instance_id}`)
        console.log(`${'='.repeat(60)}`)
      } else {
        console.log(`\n✅ 所有任务处理完成`)
      }
    } catch (error) {
      console.error(`\n❌ 任务 ${item.instance_id} 处理出错: ${error.message}`)
      const batchTaskDuration = Date.now() - taskStartTime
      console.log(`  ⏱️ 任务耗时: ${formatDuration(batchTaskDuration)}`)
      progress.failed.push(item.instance_id)
      // 保存任务时间到 progress
      if (!progress.taskTimes) {
        progress.taskTimes = {}
      }
      progress.taskTimes[item.instance_id] = {
        duration: batchTaskDuration,
        durationFormatted: formatDuration(batchTaskDuration),
        startTime: new Date(taskStartTime).toISOString(),
        endTime: new Date().toISOString(),
        status: 'error',
        error: error.message
      }
      saveProgress(progress)
      stats.failed++
      
      // 即使出错，也等待一段时间再继续下一个任务（适配单进程 AI Gateway）
      if (i < items.length - 1) {
        console.log(`\n⏳ 任务 ${item.instance_id} 出错，等待 ${CONFIG.requestDelay / 1000} 秒后继续下一个任务...`)
        await delay(CONFIG.requestDelay)
        
        // 显示下一个任务信息
        const nextItem = items[i + 1]
        console.log(`\n${'='.repeat(60)}`)
        console.log(`开始处理下一个任务 ${i + 2}/${items.length}: ${nextItem.instance_id}`)
        console.log(`${'='.repeat(60)}`)
      }
    }
  }
  
  isProcessing = false
  saveProgress(progress)
  
  const duration = Date.now() - stats.startTime
  
  console.log('\n' + '═'.repeat(48))
  console.log('处理完成')
  console.log('═'.repeat(48))
  console.log(`  总数: ${stats.total}`)
  console.log(`  成功: ${stats.success}`)
  console.log(`  失败: ${stats.failed}`)
  console.log(`  总用时: ${formatDuration(duration)}`)
  console.log(`  SQL 输出: ${CONFIG.outputDirSql}`)
  console.log(`  CSV 输出: ${CONFIG.outputDirCsv}`)
  
  // 显示任务时间统计
  if (progress.taskTimes && Object.keys(progress.taskTimes).length > 0) {
    console.log('\n' + '─'.repeat(48))
    console.log('任务时间统计:')
    console.log('─'.repeat(48))
    const taskTimes = progress.taskTimes
    const sortedTasks = Object.entries(taskTimes).sort((a, b) => b[1].duration - a[1].duration)
    
    // 显示最快和最慢的任务
    if (sortedTasks.length > 0) {
      const fastest = sortedTasks[sortedTasks.length - 1]
      const slowest = sortedTasks[0]
      console.log(`  最快: ${fastest[0]} - ${fastest[1].durationFormatted}`)
      console.log(`  最慢: ${slowest[0]} - ${slowest[1].durationFormatted}`)
      
      // 计算平均时间
      const totalDuration = Object.values(taskTimes).reduce((sum, t) => sum + t.duration, 0)
      const avgDuration = totalDuration / sortedTasks.length
      console.log(`  平均: ${formatDuration(avgDuration)}`)
      
      // 显示所有任务的时间（按耗时降序）
      if (sortedTasks.length <= 20) {
        console.log('\n  所有任务耗时（从慢到快）:')
        sortedTasks.forEach(([id, time], idx) => {
          console.log(`    ${idx + 1}. ${id}: ${time.durationFormatted} (${time.status})`)
        })
      } else {
        console.log(`\n  （共 ${sortedTasks.length} 个任务，详细时间已保存到 progress.json）`)
      }
    }
    console.log('─'.repeat(48))
    console.log(`  详细时间记录已保存到: ${CONFIG.progressFile}`)
  }
  
  console.log('═'.repeat(48))
  
  cleanupResources()
  process.exit(0)
}

main().catch(error => {
  logError('ERROR', '程序异常退出', error)
  cleanupResources()
  process.exit(1)
})
