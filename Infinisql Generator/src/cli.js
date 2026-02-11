#!/usr/bin/env node
/**
 * Infinisql Generator CLI 入口 — 第二版（模块化）
 *
 * 本入口为第二版实现，逻辑分布在 src/ 各模块。第一版单体入口为根目录 infinisql_client.js。
 *
 * 用法:
 *   node src/cli.js [选项]
 * 
 * 选项:
 *   --token <token>      JWT Token（可选，未传则从项目根 .env 的 AI_GATEWAY_TOKEN 读取）
 *   --env <name>         环境配置名称
 *   --stats              显示进度统计
 *   --list               列出所有问题
 *   --tested             显示已测试的问题
 *   --setup              设置所有数据源
 *   --setup-kb           设置所有知识库
 *   --batch [count]      批量处理 count 个问题
 *   --all                处理所有未测试的问题
 *   --one                单问题查询模式
 *   --id <id>            指定问题 ID
 *   --index <n>          指定问题索引
 *   --random [count]      随机选择一个或多个问题（count 为数量，默认为1）
 *   --ids-file <path>    从文件读取 instance_id 列表（每行一个），只处理这些题
 *   --setup-ds-ids       仅创建 --ids-file 中题目涉及的数据源（不跑任务）
 *   --help, -h           显示帮助
 *   --version, -v        显示版本
 */

const fs = require('fs')
const path = require('path')
const { CONFIG, getConfig, ROOT_DIR } = require('./config')
const { initEnv, getToken } = require('./config/env')
const { loadDatasourceConfig } = require('./config/datasource')
const appState = require('./state')
const { readJSONL, ensureDirs } = require('./utils/file')
const { loadProgress, saveProgress, getTestedIds, displayStats } = require('./handlers/progress')
const websocket = require('./services/websocket')
const { handleServerMessage } = require('./handlers/message')
const commands = require('./commands')

// 版本信息
const VERSION = '2.0.0'

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
Infinisql Generator - AI Gateway SQL 生成工具

用法:
  node src/cli.js [选项]

Token（以下命令均优先从项目根目录 .env 的 AI_GATEWAY_TOKEN 读取，可不写 --token）:
  --token <token>          传入 JWT；未传则从 .env 或环境变量 AI_GATEWAY_TOKEN 读取

环境配置:
  --env <name>             使用指定环境配置（如 production, dev）

统计和查看:
  --stats                  显示进度统计
  --list                   列出所有问题
  --tested                 显示已测试的问题

数据源管理:
  --setup                  设置所有数据源（自动清理并重新创建）
  --create-ds <id>         创建单个数据源 (按 instance_id)
  --list-ds                列出可用数据源
  --ds-config / --show-config  显示数据源配置模板
  --reset-ds               清除数据源映射（重新创建模式）
  --reset-all              清除所有本地映射（数据源+知识库）

知识库管理:
  --setup-kb               一键创建所有知识库并上传文件（自动清理本地映射）
  --create-kb <id>        创建单个知识库并上传 md 文件
  --upload-kb <kb_id> <filename>  上传文件到现有知识库

批量处理:
  --batch [count]          批量处理 count 个问题（默认 10）
  --all                    处理所有未测试的问题
  --ids-file <path>        从文件读取 instance_id 列表（每行一个），只处理这些题
  --setup-ds-ids           仅创建 --ids-file 中题目涉及的数据源（不跑任务）
  --resume                 从上次中断处继续（跳过 progress 中已完成的）
  --random-count <n>       随机选择 n 个未测试问题并依次处理
  --start <n>              从第 n 个开始（--ids-file 时无效）
  --skip-tested            跳过已测试的问题（默认）
  --no-skip-tested         不跳过已测试的问题

单问题查询:
  --one                    单问题查询模式
  --id <id>                指定问题 ID
  --index <n>              指定问题索引
  --random [count]         随机选择一个或多个未测试的问题（count 为数量，默认为1）

其他:
  --version, -v            显示版本
  --help, -h               显示帮助

示例（未写 --token 时从项目根 .env 的 AI_GATEWAY_TOKEN 读取）:
  node src/cli.js --stats
  node src/cli.js --setup
  node src/cli.js --batch 20
  node src/cli.js --one --id sf_bq001
  node src/cli.js --one --random 2
  node src/cli.js --ids-file path/to/sampled_20_instance_ids.txt
  node src/cli.js --ids-file path/to/sampled_20_instance_ids.txt --setup-ds-ids
  node src/cli.js --resume
  node src/cli.js --random-count 5
  node src/cli.js --create-kb sf_bq009
  node src/cli.js --upload-kb <kb_id> filename.md
  node src/cli.js --env production --batch 10
`)
}

/**
 * 显示版本
 */
function showVersion() {
  console.log(`Infinisql Generator v${VERSION}`)
}

/**
 * 解析命令行参数
 * @returns {Object} 解析后的选项
 */
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    token: null,
    env: null,
    stats: false,
    list: false,
    tested: false,
    setup: false,
    setupKb: false,
    createDs: false,
    createDsId: null,
    createKb: false,
    createKbId: null,
    uploadKb: false,
    uploadKbId: null,
    uploadKbFilename: null,
    listDs: false,
    dsConfig: false,
    showConfig: false,
    resetDs: false,
    resetAll: false,
    batch: false,
    batchCount: 10,
    all: false,
    start: 0,
    skipTested: true,
    one: false,
    oneId: null,
    oneIndex: null,
    oneRandom: false,
    randomCount: null,
    idsFile: null,
    setupDsIds: false,
    resume: false,
    randomCount: null,
    help: false,
    version: false,
  }
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    switch (arg) {
      case '--token':
        options.token = args[++i]
        break
      case '--env':
        options.env = args[++i]
        break
      case '--stats':
        options.stats = true
        break
      case '--list':
        options.list = true
        break
      case '--tested':
        options.tested = true
        break
      case '--setup':
        options.setup = true
        break
      case '--setup-kb':
        options.setupKb = true
        break
      case '--create-ds':
        options.createDs = true
        options.createDsId = args[++i]
        break
      case '--create-kb':
        options.createKb = true
        options.createKbId = args[++i]
        break
      case '--upload-kb':
        options.uploadKb = true
        options.uploadKbId = args[++i] || null
        options.uploadKbFilename = args[++i] || null
        break
      case '--list-ds':
        options.listDs = true
        break
      case '--ds-config':
        options.dsConfig = true
        break
      case '--show-config':
        options.showConfig = true
        options.dsConfig = true
        break
      case '--reset-ds':
        options.resetDs = true
        break
      case '--reset-all':
        options.resetAll = true
        break
      case '--batch':
        options.batch = true
        // 检查下一个参数是否是数字
        if (args[i + 1] && !args[i + 1].startsWith('-')) {
          options.batchCount = parseInt(args[++i], 10) || 10
        }
        break
      case '--all':
        options.all = true
        break
      case '--start':
        options.start = parseInt(args[++i], 10) || 0
        break
      case '--skip-tested':
        options.skipTested = true
        break
      case '--no-skip-tested':
        options.skipTested = false
        break
      case '--one':
        options.one = true
        break
      case '--id':
        options.oneId = args[++i]
        break
      case '--index':
        options.oneIndex = parseInt(args[++i], 10)
        break
      case '--random':
        options.oneRandom = true
        // 检查下一个参数是否是数字（用于指定随机问题数量）
        if (args[i + 1] && !args[i + 1].startsWith('-')) {
          options.randomCount = parseInt(args[++i], 10)
        }
        break
      case '--ids-file':
        options.idsFile = args[++i] || null
        break
      case '--setup-ds-ids':
        options.setupDsIds = true
        break
      case '--resume':
        options.resume = true
        break
      case '--random-count':
        options.randomCount = parseInt(args[++i], 10) || null
        break
      case '--help':
      case '-h':
        options.help = true
        break
      case '--version':
      case '-v':
        options.version = true
        break
    }
  }
  
  return options
}

/**
 * 主函数
 */
async function main() {
  const options = parseArgs()
  
  // 显示帮助
  if (options.help) {
    showHelp()
    process.exit(0)
  }
  
  // 显示版本
  if (options.version) {
    showVersion()
    process.exit(0)
  }
  
  // 始终加载 .env（项目根目录），以便从 AI_GATEWAY_TOKEN 或 TOKEN 读 token
  initEnv(options.env || null)
  
  // 获取 Token（优先 --token，其次环境变量 AI_GATEWAY_TOKEN / TOKEN）
  const token = options.token || getToken()
  
  // 需要 Token 的操作
  const needsToken = options.setup || options.setupKb || options.createDs || 
                     options.createKb || options.uploadKb || options.listDs || options.batch || 
                     options.all || options.one || !!options.idsFile || options.setupDsIds
  
  if (needsToken && !token) {
    console.error('错误: 请提供 Token。可：1) --token <值>  2) 在项目根目录 .env 中配置 AI_GATEWAY_TOKEN=  3) 设置环境变量 AI_GATEWAY_TOKEN')
    process.exit(1)
  }
  
  // 加载问题列表（某些命令需要）
  let items = []
  const needsItems = options.stats || options.list || options.batch || 
                     options.all || options.one || !!options.idsFile || !!options.resume || !!options.randomCount
  
  if (needsItems) {
    try {
      items = await readJSONL(CONFIG.inputFile)
    } catch (error) {
      console.error(`错误: 无法加载问题列表: ${error.message}`)
      process.exit(1)
    }
  }
  
  // 显示数据源配置模板
  if (options.dsConfig || options.showConfig) {
    commands.showDatasourceConfig()
    process.exit(0)
  }
  
  // 重置数据源映射
  if (options.resetDs) {
    commands.resetDatasourceMap()
    process.exit(0)
  }
  
  // 重置所有本地映射（数据源+知识库，与第一版 --reset-all 一致）
  if (options.resetAll) {
    commands.resetAllMappings()
    process.exit(0)
  }
  
  // 显示统计
  if (options.stats) {
    commands.showStats(items)
    process.exit(0)
  }
  
  // 列出问题
  if (options.list) {
    commands.showList(items)
    process.exit(0)
  }
  
  // 显示已测试
  if (options.tested) {
    commands.showTested()
    process.exit(0)
  }
  
  // 列出数据源
  if (options.listDs) {
    await commands.listAllDatasources(token)
    process.exit(0)
  }
  
  // 设置数据源
  if (options.setup) {
    await commands.setupAllDatasources(token)
    process.exit(0)
  }

  // 仅创建 ids-file 涉及的数据源（不跑任务）
  if (options.setupDsIds) {
    if (!options.idsFile) {
      console.error('错误: --setup-ds-ids 需要同时指定 --ids-file <path>')
      process.exit(1)
    }
    await commands.createDatasourcesFromIdsFile(token, options.idsFile)
    process.exit(0)
  }
  
  // 创建单个数据源
  if (options.createDs) {
    await commands.createSingleDatasource(token, options.createDsId)
    process.exit(0)
  }
  
  // 设置知识库
  if (options.setupKb) {
    await commands.setupAllKnowledgeBases(token)
    process.exit(0)
  }
  
  // 创建单个知识库
  if (options.createKb) {
    await commands.createSingleKnowledgeBase(token, options.createKbId)
    process.exit(0)
  }
  
  // 上传文件到现有知识库（与第一版 --upload-kb 一致）
  if (options.uploadKb) {
    await commands.uploadToKnowledgeBase(token, options.uploadKbId, options.uploadKbFilename)
    process.exit(0)
  }
  
  // 单问题查询
  if (options.one) {
    // 统一走 batch/processTask 链路，使“完成判定/超时/断线处理”与 --random-count 完全一致
    if (options.oneRandom) {
      const n = (options.randomCount && options.randomCount > 0) ? options.randomCount : 1
      await commands.runBatch(token, {
        start: 0,
        count: Infinity,
        skipTested: true,
        idsFile: null,
        resume: false,
        randomCount: n,
      })
      process.exit(0)
    }

    let instanceId = null
    if (options.oneId) {
      instanceId = options.oneId
    } else if (options.oneIndex !== null) {
      if (options.oneIndex < 0 || options.oneIndex >= items.length) {
        console.error(`错误: 索引 ${options.oneIndex} 超出范围 (0-${items.length - 1})`)
        process.exit(1)
      }
      instanceId = items[options.oneIndex].instance_id
    } else {
      console.error('错误: 请指定 --id, --index 或 --random')
      showHelp()
      process.exit(1)
    }

    await commands.runSingle(token, instanceId)
    process.exit(0)
  }
  
  // 批量处理（--batch / --ids-file / --resume / --random-count）
  if (options.batch || options.idsFile || options.resume || options.randomCount != null) {
    const count = (options.resume && options.randomCount == null && !options.batch)
      ? Infinity
      : (options.batchCount > 0 ? options.batchCount : Infinity)
    await commands.runBatch(token, {
      start: options.start,
      count,
      skipTested: options.skipTested,
      idsFile: options.idsFile || null,
      resume: options.resume,
      randomCount: options.randomCount,
    })
    process.exit(0)
  }
  
  // 处理所有
  if (options.all) {
    await commands.runAll(token)
    process.exit(0)
  }
  
  // 如果没有指定任何命令，显示帮助
  showHelp()
}

// 运行
main().catch(error => {
  console.error(`致命错误: ${error.message}`)
  process.exit(1)
})
