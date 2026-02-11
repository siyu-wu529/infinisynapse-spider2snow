/**
 * 知识库服务模块
 * 
 * 管理 AI Gateway 中的知识库：创建、查询、上传文件
 */

const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const { CONFIG } = require('../config')
const { httpRequest } = require('../utils/http')
const { readJSONL, extractDescription } = require('../utils/file')
const { delay } = require('../utils/format')
const { loadKnowledgeMap, saveKnowledgeMap } = require('../handlers/progress')
const { loadDatasourceConfig } = require('../config/datasource')
const appState = require('../state')
const { KnowledgeBaseError } = require('../errors')

/**
 * 获取知识库信息
 * @param {string} token - JWT Token
 * @param {string} nameOrId - 知识库名称或 ID
 * @returns {Promise<Object|null>} 知识库信息
 */
async function getKnowledgeBaseInfo(token, nameOrId) {
  try {
    const endpoints = [
      { url: '/api/ai_rag_sdk/list', method: 'POST', body: { name: nameOrId } },
      { url: '/api/ai_rag_sdk/get', method: 'POST', body: { name: nameOrId } },
      { url: '/api/tools/knowledges', method: 'GET' },
    ]
    
    for (const endpoint of endpoints) {
      try {
        const fullUrl = `${CONFIG.apiUrl}${endpoint.url}`
        const response = await httpRequest(fullUrl, token, endpoint.method, endpoint.body)
        
        if (response.html || response.code === 404) {
          continue
        }
        
        if (response.code === 200 && response.data) {
          const data = response.data
          let kb = null
          
          if (Array.isArray(data)) {
            kb = data.find(k => k.name === nameOrId || k.id === nameOrId || k.kb_id === nameOrId)
          } else if (data.name === nameOrId || data.id === nameOrId || data.kb_id === nameOrId) {
            kb = data
          }
          
          if (kb) {
            return kb
          }
        }
      } catch (error) {
        continue
      }
    }
    
    return null
  } catch (error) {
    return null
  }
}

/**
 * 创建知识库
 * @param {string} token - JWT Token
 * @param {string} name - 知识库名称
 * @param {string} description - 描述
 * @param {string|string[]} datasourceIds - 数据源 ID 或 ID 数组
 * @returns {Promise<Object|null>} { id, exists }
 */
async function createKnowledgeBase(token, name, description, datasourceIds) {
  const dsIds = Array.isArray(datasourceIds) ? datasourceIds : [datasourceIds]
  
  const body = {
    name: name,
    description: description,
    ragDocFilterRelevance: '0',
    requiredExts: ['.md'],
    enabled: '1',
    database_ids: dsIds
  }

  console.log(`\n📋 创建知识库...`)
  console.log(`  名称: ${name}`)
  console.log(`  描述: ${description.substring(0, 80)}...`)
  console.log(`  数据源 (${dsIds.length}个): ${dsIds.slice(0, 3).join(', ')}${dsIds.length > 3 ? '...' : ''}`)

  const result = await httpRequest(CONFIG.apiUrl + CONFIG.knowledgeCreateApi, token, 'POST', body)
  console.log(`  Status: ${result.status || result.code}`)
  console.log(`  API 响应: ${JSON.stringify(result)}`)

  if (result.code === 1506 || result.message?.includes('duplicate')) {
    console.log(`  ⚠️ 知识库名称已存在`)
    
    console.log(`  查询已存在的知识库信息...`)
    const existingKb = await getKnowledgeBaseInfo(token, name)
    
    if (existingKb) {
      const existingId = existingKb.id || existingKb.kb_id
      console.log(`  ✓ 找到已存在的知识库，ID: ${existingId}`)
      
      const kbMap = loadKnowledgeMap()
      kbMap[name] = existingId
      saveKnowledgeMap(kbMap)
      
      return { id: existingId, exists: true }
    }
    
    const kbMap = loadKnowledgeMap()
    if (kbMap[name]) {
      console.log(`  ✓ 从本地映射找到已有 ID: ${kbMap[name]}`)
      return { id: kbMap[name], exists: true }
    }
    
    console.log(`  ❌ 无法找到已存在的知识库信息`)
    return null
  }

  const actualId = result.data?.id || result.data?.kb_id || result.id
  if (!actualId) {
    console.log(`  ❌ 无法获取服务端返回的知识库 ID`)
    return null
  }
  
  console.log(`  ✓ 知识库创建成功，ID: ${actualId}`)
  
  return { id: actualId, exists: false }
}

/**
 * 上传文件到知识库
 * @param {string} token - JWT Token
 * @param {string} kbId - 知识库 ID
 * @param {string} filePath - 文件路径
 * @param {string} filename - 文件名
 * @returns {Promise<boolean>} 是否成功
 */
async function uploadFile(token, kbId, filePath, filename) {
  const fileContent = fs.readFileSync(filePath)

  const boundary = '----WebKitFormBoundary' + require('crypto').randomUUID().substring(0, 16)
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/markdown\r\n\r\n`
  const footer = `\r\n--${boundary}--\r\n`

  const bodyContent = Buffer.concat([
    Buffer.from(header, 'utf8'),
    fileContent,
    Buffer.from(footer, 'utf8')
  ])

  return new Promise((resolve, reject) => {
    const urlObj = new URL(CONFIG.apiUrl + CONFIG.uploadApiPrefix + '/' + kbId)
    const transport = urlObj.protocol === 'https:' ? https : http

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
    }

    console.log(`  上传 URL: ${urlObj.href}`)
    console.log(`  文件大小: ${fileContent.length} bytes`)

    const req = transport.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        console.log(`  Status: ${res.statusCode}`)
        if (data) {
          try {
            const json = JSON.parse(data)
            console.log(`  Response: ${JSON.stringify(json)}`)
            if (json.code === 200) {
              console.log(`  ✓ 文件上传成功`)
              resolve(true)
              return
            }
          } catch (e) {
            console.log(`  Response (raw): ${data.substring(0, 200)}`)
          }
        }
        resolve(res.statusCode === 201 || res.statusCode === 200)
      })
    })

    req.on('error', (error) => {
      console.log(`  ❌ 请求错误: ${error.message}`)
      reject(error)
    })
    req.write(bodyContent)
    req.end()
  })
}

/**
 * 创建知识库并上传文件（单个问题）
 * @param {string} token - JWT Token
 * @param {string} instanceId - 实例 ID
 * @returns {Promise<boolean>} 是否成功
 */
async function createKnowledge(token, instanceId) {
  const questionsFile = CONFIG.inputFile
  const docsDir = CONFIG.docsDir

  // 读取问题数据
  const items = await readJSONL(questionsFile)
  const questionInfo = items.find(i => i.instance_id === instanceId)

  if (!questionInfo) {
    console.error(`❌ 未找到问题: ${instanceId}`)
    return false
  }

  console.log(`🎯 处理问题: ${instanceId}`)
  console.log(`  db_id: ${questionInfo.db_id}`)
  console.log(`  external_knowledge: ${questionInfo.external_knowledge || 'null'}`)

  // 检查是否有外部知识文档
  const mdFilename = questionInfo.external_knowledge
  if (!mdFilename || mdFilename === 'null' || mdFilename === '') {
    console.log(`\n✅ 该问题没有外部知识文档，无需创建知识库`)
    return true
  }

  const mdPath = path.join(docsDir, mdFilename)

  if (!fs.existsSync(mdPath)) {
    console.error(`❌ md 文件不存在: ${mdPath}`)
    return false
  }

  // 读取 md 文件
  const content = fs.readFileSync(mdPath, 'utf8')
  const description = extractDescription(content)
  const name = mdFilename.replace('.md', '').replace(/\./g, '_')

  // 加载数据源配置，获取每个问题实际使用的 schema
  const datasourceConfigMap = loadDatasourceConfig()
  
  // 找出所有使用同一个 md 文件的问题，收集所有关联的数据源名称
  const relatedDatasourceNames = new Set()
  for (const item of items) {
    if (item.external_knowledge === mdFilename) {
      // 从配置中获取该问题实际使用的数据源名称（包括所有带 * 的 schema）
      const config = datasourceConfigMap[item.instance_id]
      if (config) {
        // 使用 config.names（所有多 schema 数据源名称）或 config.name（单 schema）
        const datasourceNames = config.names && config.names.length > 0 
          ? config.names 
          : (config.name ? [config.name] : [])
        datasourceNames.forEach(name => relatedDatasourceNames.add(name))
      } else {
        // 如果配置中没有，回退到使用 db_id
        relatedDatasourceNames.add(item.db_id)
      }
    }
  }
  
  console.log(`  关联数据源 (${relatedDatasourceNames.size}个): ${Array.from(relatedDatasourceNames).join(', ')}`)

  // 获取所有关联数据源的 ID（使用数据源名称，而不是 db_id）
  const datasourceIds = []
  for (const datasourceName of relatedDatasourceNames) {
    const dsId = appState.datasourceIdMap[datasourceName]
    if (dsId && dsId !== 'EXISTS') {
      datasourceIds.push(dsId)
    } else {
      console.log(`  ⚠️ 数据源 "${datasourceName}" 未配置`)
    }
  }

  if (datasourceIds.length === 0) {
    console.error(`❌ 没有可用的数据源 ID，请先配置数据源`)
    return false
  }

  // 尝试创建知识库（关联所有数据源）
  let kbResult = await createKnowledgeBase(token, name, description, datasourceIds)

  if (!kbResult) {
    console.log(`  ❌ 无法创建或获取知识库 ID`)
    return false
  }

  const kbId = kbResult.id
  const kbExists = kbResult.exists

  console.log(`\n📤 上传文件到知识库...`)
  console.log(`  知识库 ID: ${kbId}`)
  console.log(`  知识库状态: ${kbExists ? '已存在' : '新创建'}`)

  // 上传文件
  const success = await uploadFile(token, kbId, mdPath, mdFilename)

  if (success) {
    // 保存到知识库映射文件（与第一版一致）
    const kbMap = loadKnowledgeMap()
    kbMap[name] = kbId
    saveKnowledgeMap(kbMap)
    console.log(`  ✓ 已保存到 ${CONFIG.knowledgeMapFile}`)
    // 与第一版一致：保存详细结果到 knowledge_base.json
    const result = {
      kb_id: kbId,
      name: name,
      datasource_ids: datasourceIds,
      db_ids: Array.from(relatedDbIds),
      md_filename: mdFilename,
      instance_id: instanceId,
      kb_existed: kbExists,
    }
    const outPath = path.resolve(process.cwd(), 'knowledge_base.json')
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2))
    console.log(`\n✅ 结果已保存到 knowledge_base.json`)
    return true
  } else {
    console.log(`  ❌ 文件上传失败`)
    return false
  }
}

/**
 * 批量任务中：为当前问题按需创建/更新知识库，并确保关联到当前题使用的数据源
 * - 仅当 external_knowledge 存在时生效
 * - 如果知识库已存在：合并当前题的数据源 ID，调用 update 接口更新 database_ids
 * - 如果知识库不存在：创建 + 上传 md + 写入 knowledge_map.json
 * @param {string} token - JWT Token
 * @param {Object} item - 问题项（来自 spider2-snow.jsonl）
 * @returns {Promise<boolean>} 是否成功（失败不会阻塞主流程）
 */
async function ensureKnowledgeForBatch(token, item) {
  const mdFilename = item.external_knowledge
  if (!mdFilename || mdFilename === 'null' || mdFilename === '') {
    // 该题本身不需要知识库
    return true
  }

  const docsDir = CONFIG.docsDir
  const mdPath = path.join(docsDir, mdFilename)
  if (!fs.existsSync(mdPath)) {
    console.log(`  ⚠️ external_knowledge 对应的 md 文件不存在，跳过知识库处理: ${mdPath}`)
    return false
  }

  const name = mdFilename.replace('.md', '').replace(/\./g, '_')
  const kbMap = loadKnowledgeMap()

  // 计算描述（用于创建或更新）
  const content = fs.readFileSync(mdPath, 'utf8')
  const description = extractDescription(content)

  // 找出当前问题需要关联的数据源名称（与 buildPrompt/use config.names 的逻辑保持一致）
  const datasourceConfigMap = appState.datasourceConfigMap && Object.keys(appState.datasourceConfigMap).length
    ? appState.datasourceConfigMap
    : loadDatasourceConfig()
  const cfg = datasourceConfigMap[item.instance_id]

  const relatedDatasourceNames = new Set()
  if (cfg && cfg.names && cfg.names.length > 0) {
    cfg.names.forEach(n => relatedDatasourceNames.add(n))
  } else if (cfg && cfg.name) {
    relatedDatasourceNames.add(cfg.name)
  } else if (item.db_id) {
    relatedDatasourceNames.add(item.db_id)
  }

  if (relatedDatasourceNames.size === 0) {
    console.log(`  ⚠️ 未找到可用于知识库关联的数据源名称，跳过知识库处理`)
    return false
  }

  // 将名称映射成已创建的数据源 ID
  const datasourceIds = []
  for (const dsName of relatedDatasourceNames) {
    const dsId = appState.datasourceIdMap[dsName]
    if (dsId && dsId !== 'EXISTS') {
      datasourceIds.push(dsId)
    } else {
      console.log(`  ⚠️ 知识库自动处理: 数据源 "${dsName}" 未在本地映射中，跳过关联`)
    }
  }

  if (datasourceIds.length === 0) {
    console.log(`  ⚠️ 没有可用的数据源 ID，跳过知识库处理（请先确保数据源已创建）`)
    return false
  }

  try {
    // 先尝试确定远端已有的知识库（按本地映射 ID 或按名称）
    let kbId = kbMap[name] || null
    let kbInfo = null

    if (kbId) {
      kbInfo = await getKnowledgeBaseInfo(token, kbId) || await getKnowledgeBaseInfo(token, name)
    } else {
      kbInfo = await getKnowledgeBaseInfo(token, name)
      if (kbInfo) {
        kbId = kbInfo.id || kbInfo.kb_id
        if (kbId) {
          kbMap[name] = kbId
          saveKnowledgeMap(kbMap)
        }
      }
    }

    if (!kbId) {
      // 远端也不存在，则创建新知识库并上传
      console.log(`  🔍 自动创建知识库: ${name}`)
      const kbResult = await createKnowledgeBase(token, name, description, datasourceIds)
      if (!kbResult || !kbResult.id) {
        console.log(`  ⚠️ 无法创建或获取知识库 ID，跳过`)
        return false
      }
      kbId = kbResult.id
      const kbExists = kbResult.exists
      console.log(`  📚 知识库 ${kbExists ? '已存在' : '新创建'}，ID: ${kbId}`)

      // 如果是真正新建的知识库，create 已经带上了 database_ids，这里只做一次上传并返回
      if (!kbExists) {
        const ok = await uploadFile(token, kbId, mdPath, mdFilename)
        if (!ok) {
          console.log(`  ⚠️ 知识库文件上传失败（不阻塞任务）`)
          return false
        }
        kbMap[name] = kbId
        saveKnowledgeMap(kbMap)
        console.log(`  ✓ 已更新本地知识库映射: ${name} -> ${kbId}`)
        return true
      }

      // 如果是“名称已存在”的情况（kbExists=true），说明服务端已有此 KB，
      // 我们仅记录映射，后面走统一的“已存在知识库”分支去做 database_ids 合并更新
      kbMap[name] = kbId
      saveKnowledgeMap(kbMap)
    }

    // 已存在的知识库：优先从远端获取详情，若不存在则退回到“重新创建”逻辑
    console.log(`  🔍 自动更新知识库: ${name} (ID: ${kbId})`)
    const existingInfo = kbInfo || (await getKnowledgeBaseInfo(token, kbId) || await getKnowledgeBaseInfo(token, name))

    if (!existingInfo) {
      console.log(`  ⚠️ 远端未找到已有知识库，改为重新创建: ${name}`)
      const kbResult = await createKnowledgeBase(token, name, description, datasourceIds)
      if (!kbResult || !kbResult.id) {
        console.log(`  ⚠️ 重新创建知识库失败，跳过`)
        return false
      }
      kbId = kbResult.id
      const kbExists = kbResult.exists
      console.log(`  📚 知识库 ${kbExists ? '已存在' : '新创建'}，ID: ${kbId}`)

      const ok = await uploadFile(token, kbId, mdPath, mdFilename)
      if (!ok) {
        console.log(`  ⚠️ 知识库文件上传失败（不阻塞任务）`)
        return false
      }

      kbMap[name] = kbId
      saveKnowledgeMap(kbMap)
      console.log(`  ✓ 已更新本地知识库映射: ${name} -> ${kbId}`)
      return true
    }

    // 从远端信息中读取当前已关联的数据源 ID
    // 优先使用 linkedDatabases，其次兼容老字段 database_ids/databaseIds
    const existingDbIds = new Set(
      (existingInfo.linkedDatabases || existingInfo.database_ids || existingInfo.databaseIds || []) || []
    )

    let changed = false
    for (const id of datasourceIds) {
      if (!existingDbIds.has(id)) {
        existingDbIds.add(id)
        changed = true
      }
    }

    if (!changed) {
      // 当前题需要的所有数据源已经关联过，无需更新
      return true
    }

    const mergedIds = Array.from(existingDbIds)
    const updateBody = {
      id: kbId,
      name,
      description,
      ragDocFilterRelevance: '0',
      requiredExts: ['.md'],
      enabled: '1',
      docDir: (existingInfo && existingInfo.docDir) || kbId,
      // 兼容两种字段：新接口用 linkedDatabases，老接口用 database_ids
      linkedDatabases: mergedIds,
      database_ids: mergedIds,
    }

    const updateUrl = `${CONFIG.apiUrl}/api/ai_rag_sdk/update/${kbId}`
    const result = await httpRequest(updateUrl, token, 'POST', updateBody)

    const code = result.code || result.status
    if (code === 200 || code === 201) {
      console.log(`  ✓ 知识库已更新 database_ids，当前关联数据源数: ${updateBody.database_ids.length}`)
      // 不再强制重新上传 md，认为文档内容已存在
      kbMap[name] = kbId
      saveKnowledgeMap(kbMap)
      return true
    }

    console.log(`  ⚠️ 知识库更新失败(code=${code})，响应: ${JSON.stringify(result).substring(0, 300)}...`)
    return false
  } catch (e) {
    console.log(`  ⚠️ 自动创建/更新知识库出错（不阻塞任务）: ${e.message}`)
    return false
  }
}

/**
 * 批量设置所有知识库
 * @param {string} token - JWT Token
 * @returns {Promise<void>}
 */
async function setupAllKnowledgeBases(token) {
  const questionsFile = CONFIG.inputFile
  const docsDir = CONFIG.docsDir

  // 读取问题数据
  const items = await readJSONL(questionsFile)
  
  // 加载数据源配置，获取每个问题实际使用的 schema
  const datasourceConfigMap = loadDatasourceConfig()
  
  // 找出所有需要外部知识的问题，收集每个知识库关联的所有数据源
  // md_filename -> { datasource_names: Set, instance_ids: [] }
  const knowledgeMap = new Map()
  
  for (const item of items) {
    const mdFilename = item.external_knowledge
    if (mdFilename && mdFilename !== 'null' && mdFilename !== '') {
      if (!knowledgeMap.has(mdFilename)) {
        knowledgeMap.set(mdFilename, { datasource_names: new Set(), instance_ids: [] })
      }
      const entry = knowledgeMap.get(mdFilename)
      entry.instance_ids.push(item.instance_id)
      
      // 从配置中获取该问题实际使用的数据源名称（包括所有带 * 的 schema）
      const config = datasourceConfigMap[item.instance_id]
      if (config) {
        // 使用 config.names（所有多 schema 数据源名称）或 config.name（单 schema）
        const datasourceNames = config.names && config.names.length > 0 
          ? config.names 
          : (config.name ? [config.name] : [])
        datasourceNames.forEach(name => entry.datasource_names.add(name))
      } else {
        // 如果配置中没有，回退到使用 db_id
        entry.datasource_names.add(item.db_id)
      }
    }
  }
  
  const uniqueKnowledges = Array.from(knowledgeMap.keys())
  console.log(`\n📚 需要创建 ${uniqueKnowledges.length} 个知识库`)
  console.log(`   （共 ${items.length} 个问题，${items.length - uniqueKnowledges.length} 个无需知识库）\n`)
  
  // 加载已有的知识库映射
  const existingKbMap = loadKnowledgeMap()
  const alreadyCreated = uniqueKnowledges.filter(md => {
    const name = md.replace('.md', '').replace(/\./g, '_')
    return existingKbMap[name]
  })
  
  if (alreadyCreated.length > 0) {
    console.log(`✓ 已存在 ${alreadyCreated.length} 个知识库，将跳过`)
  }
  
  let created = 0
  let skipped = 0
  let failed = 0
  
  for (let i = 0; i < uniqueKnowledges.length; i++) {
    const mdFilename = uniqueKnowledges[i]
    const name = mdFilename.replace('.md', '').replace(/\./g, '_')
    const entry = knowledgeMap.get(mdFilename)
    const datasourceNames = Array.from(entry.datasource_names)
    const instanceIds = entry.instance_ids
    
    console.log(`\n[${i + 1}/${uniqueKnowledges.length}] ${mdFilename}`)
    console.log(`   关联数据源 (${datasourceNames.length}个): ${datasourceNames.join(', ')}`)
    console.log(`   关联问题: ${instanceIds.slice(0, 3).join(', ')}${instanceIds.length > 3 ? '...' : ''}`)
    
    // 检查是否已存在
    if (existingKbMap[name]) {
      console.log(`   ✓ 已存在，跳过 (ID: ${existingKbMap[name]})`)
      skipped++
      continue
    }
    
    // 检查 md 文件是否存在
    const mdPath = path.join(docsDir, mdFilename)
    if (!fs.existsSync(mdPath)) {
      console.log(`   ❌ md 文件不存在: ${mdPath}`)
      failed++
      continue
    }
    
    // 获取所有关联数据源的 ID（使用数据源名称，而不是 db_id）
    const datasourceIds = []
    let missingDs = false
    for (const datasourceName of datasourceNames) {
      let dsId = appState.datasourceIdMap[datasourceName]
      
      // 如果本地映射中没有，尝试通过 API 查询
      if (!dsId || dsId === 'EXISTS') {
        console.log(`   🔍 通过 API 查询数据源 "${datasourceName}"...`)
        const { getDatasourceIdByName } = require('./datasource')
        const foundId = await getDatasourceIdByName(token, datasourceName)
        if (foundId) {
          dsId = foundId
          // 更新本地映射
          appState.datasourceIdMap[datasourceName] = dsId
          // 保存到 progress.json
          const { loadProgress, saveProgress } = require('../handlers/progress')
          const savedProgress = loadProgress()
          savedProgress.datasourceMap = savedProgress.datasourceMap || {}
          savedProgress.datasourceMap[datasourceName] = dsId
          saveProgress(savedProgress)
          console.log(`   ✓ 找到数据源 ID: ${dsId}`)
        }
      }
      
      if (dsId && dsId !== 'EXISTS') {
        datasourceIds.push(dsId)
      } else {
        console.log(`   ⚠️ 数据源 "${datasourceName}" 未配置`)
        missingDs = true
      }
    }
    
    if (datasourceIds.length === 0) {
      console.log(`   ❌ 没有可用的数据源 ID，跳过`)
      failed++
      continue
    }
    
    if (missingDs) {
      console.log(`   ⚠️ 部分数据源缺失，继续使用已有的 ${datasourceIds.length} 个数据源`)
    }
    
    // 读取 md 文件内容
    const content = fs.readFileSync(mdPath, 'utf8')
    const description = extractDescription(content)
    
    // 创建知识库（关联所有数据源）
    const kbResult = await createKnowledgeBase(token, name, description, datasourceIds)
    
    if (!kbResult) {
      console.log(`   ❌ 无法创建知识库`)
      failed++
      continue
    }
    
    const kbId = kbResult.id
    console.log(`\n📤 上传文件到知识库...`)
    console.log(`   知识库 ID: ${kbId}`)
    
    // 上传文件
    const success = await uploadFile(token, kbId, mdPath, mdFilename)
    
    if (success) {
      // 保存到知识库映射
      const kbMap = loadKnowledgeMap()
      kbMap[name] = kbId
      saveKnowledgeMap(kbMap)
      console.log(`   ✓ 已保存到 ${CONFIG.knowledgeMapFile}`)
      created++
    } else {
      failed++
    }
    
    await delay(1000)
  }
  
  // 与第一版一致的输出格式
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`📊 知识库创建完成:`)
  console.log(`   新创建: ${created}`)
  console.log(`   已跳过: ${skipped}`)
  console.log(`   失败:   ${failed}`)
  console.log(`${'═'.repeat(50)}`)
  
  return { created, skipped, failed }
}

/**
 * 上传文件到现有知识库（与第一版一致）
 * @param {string} token - JWT Token
 * @param {string} kbId - 知识库 ID
 * @param {string} mdFilename - md 文件名（相对于 docsDir）
 * @returns {Promise<boolean>} 是否成功
 */
async function uploadToKnowledge(token, kbId, mdFilename) {
  const docsDir = CONFIG.docsDir
  const mdPath = path.join(docsDir, mdFilename)

  if (!fs.existsSync(mdPath)) {
    console.error(`❌ md 文件不存在: ${mdPath}`)
    return false
  }

  console.log(`📤 上传文件: ${mdFilename} 到知识库 ${kbId}`)
  return await uploadFile(token, kbId, mdPath, mdFilename)
}

module.exports = {
  getKnowledgeBaseInfo,
  createKnowledgeBase,
  uploadFile,
  createKnowledge,
  setupAllKnowledgeBases,
  uploadToKnowledge,
  ensureKnowledgeForBatch,
}
