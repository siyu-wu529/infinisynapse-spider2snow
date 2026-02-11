/**
 * 进度管理模块
 * 
 * 管理任务进度的保存、加载和统计
 */

const fs = require('fs')
const path = require('path')
const { CONFIG } = require('../config')
const appState = require('../state')
const { readJSON, writeJSON, listFiles } = require('../utils/file')
const { formatDuration } = require('../utils/format')

/**
 * 加载进度数据
 * @param {string} filePath - 进度文件路径（可选）
 * @returns {Object} 进度数据
 */
function loadProgress(filePath = null) {
  const file = filePath || CONFIG.progressFile
  return readJSON(file, { completed: [], failed: [], datasourceMap: {} })
}

/**
 * 保存进度数据
 * @param {Object} progress - 进度数据
 * @param {string} filePath - 进度文件路径（可选）
 */
function saveProgress(progress, filePath = null) {
  const file = filePath || CONFIG.progressFile
  
  const progressData = {
    ...progress,
    lastUpdate: new Date().toISOString(),
    stats: {
      total: appState.stats.total,
      processed: appState.stats.processed,
      success: appState.stats.success,
      failed: appState.stats.failed,
    },
    datasourceMap: appState.datasourceIdMap,
  }
  
  writeJSON(file, progressData)
}

/**
 * 加载知识库映射
 * @param {string} filePath - 映射文件路径（可选）
 * @returns {Object} 知识库映射
 */
function loadKnowledgeMap(filePath = null) {
  const file = filePath || CONFIG.knowledgeMapFile
  return readJSON(file, {})
}

/**
 * 保存知识库映射
 * @param {Object} map - 知识库映射
 * @param {string} filePath - 映射文件路径（可选）
 */
function saveKnowledgeMap(map, filePath = null) {
  const file = filePath || CONFIG.knowledgeMapFile
  writeJSON(file, map)
}

/**
 * 获取已测试的实例 ID 集合
 * @returns {Set<string>} 已测试的 ID 集合
 */
function getTestedIds() {
  const testedIds = new Set()
  
  // 从 SQL 输出目录获取
  if (fs.existsSync(CONFIG.outputDirSql)) {
    const sqlFiles = listFiles(CONFIG.outputDirSql, '.sql')
    sqlFiles.forEach(f => testedIds.add(f.replace('.sql', '')))
  }
  
  // 从 CSV 输出目录获取
  if (fs.existsSync(CONFIG.outputDirCsv)) {
    const csvFiles = listFiles(CONFIG.outputDirCsv, '.csv')
    csvFiles.forEach(f => testedIds.add(f.replace('.csv', '')))
  }
  
  return testedIds
}

/**
 * 显示进度统计
 * @param {Object[]} items - 问题列表
 * @param {Set<string>} testedIds - 已测试的 ID 集合
 */
function displayStats(items, testedIds = null) {
  const tested = testedIds || getTestedIds()
  const total = items.length
  const completed = tested.size
  const remaining = total - completed
  const progress = total > 0 ? ((completed / total) * 100).toFixed(1) : 0
  
  console.log('\n📊 进度统计')
  console.log('═'.repeat(50))
  console.log(`  总问题数: ${total}`)
  console.log(`  已完成: ${completed}`)
  console.log(`  剩余: ${remaining}`)
  console.log(`  进度: ${progress}%`)
  console.log('═'.repeat(50))
  
  // 按数据库分组统计
  const dbStats = {}
  for (const item of items) {
    const dbId = item.db_id || 'unknown'
    if (!dbStats[dbId]) {
      dbStats[dbId] = { total: 0, completed: 0 }
    }
    dbStats[dbId].total++
    if (tested.has(item.instance_id)) {
      dbStats[dbId].completed++
    }
  }
  
  console.log('\n按数据库统计:')
  console.log('-'.repeat(50))
  const sortedDbs = Object.keys(dbStats).sort()
  for (const dbId of sortedDbs) {
    const stat = dbStats[dbId]
    const dbProgress = stat.total > 0 ? ((stat.completed / stat.total) * 100).toFixed(0) : 0
    console.log(`  ${dbId}: ${stat.completed}/${stat.total} (${dbProgress}%)`)
  }
}

/**
 * 列出所有问题
 * @param {Object[]} items - 问题列表
 * @param {Set<string>} testedIds - 已测试的 ID 集合
 */
function listQuestions(items, testedIds = null) {
  const tested = testedIds || getTestedIds()
  
  console.log('\n📋 问题列表')
  console.log('═'.repeat(70))
  
  items.forEach((item, idx) => {
    const status = tested.has(item.instance_id) ? '✓' : '○'
    const instruction = item.instruction.substring(0, 50)
    console.log(`  ${status} [${idx.toString().padStart(3)}] ${item.instance_id.padEnd(15)} ${instruction}...`)
  })
  
  console.log('═'.repeat(70))
  console.log(`  ✓ = 已测试, ○ = 未测试`)
}

/**
 * 记录任务时间
 * @param {Object} progress - 进度对象
 * @param {string} instanceId - 实例 ID
 * @param {number} duration - 耗时（毫秒）
 * @param {string} status - 状态
 */
function recordTaskTime(progress, instanceId, duration, status) {
  if (!progress.taskTimes) {
    progress.taskTimes = {}
  }
  
  progress.taskTimes[instanceId] = {
    duration,
    durationFormatted: formatDuration(duration),
    status,
    endTime: new Date().toISOString(),
  }
}

/**
 * 显示任务时间统计
 * @param {Object} progress - 进度对象
 */
function displayTaskTimes(progress) {
  if (!progress.taskTimes || Object.keys(progress.taskTimes).length === 0) {
    return
  }
  
  console.log('\n⏱️ 任务耗时统计')
  console.log('-'.repeat(48))
  
  const taskTimes = progress.taskTimes
  const sortedTasks = Object.entries(taskTimes).sort((a, b) => b[1].duration - a[1].duration)
  
  if (sortedTasks.length > 0) {
    const fastest = sortedTasks[sortedTasks.length - 1]
    const slowest = sortedTasks[0]
    console.log(`  最快: ${fastest[0]} - ${fastest[1].durationFormatted}`)
    console.log(`  最慢: ${slowest[0]} - ${slowest[1].durationFormatted}`)
    
    // 计算平均时间
    const totalDuration = Object.values(taskTimes).reduce((sum, t) => sum + t.duration, 0)
    const avgDuration = totalDuration / sortedTasks.length
    console.log(`  平均: ${formatDuration(avgDuration)}`)
    
    // 显示详细列表（如果数量不多）
    if (sortedTasks.length <= 20) {
      console.log('\n  所有任务耗时（从慢到快）:')
      sortedTasks.forEach(([id, time], idx) => {
        console.log(`    ${idx + 1}. ${id}: ${time.durationFormatted} (${time.status})`)
      })
    } else {
      console.log(`\n  （共 ${sortedTasks.length} 个任务，详细时间已保存到 progress.json）`)
    }
  }
  
  console.log('-'.repeat(48))
}

module.exports = {
  loadProgress,
  saveProgress,
  loadKnowledgeMap,
  saveKnowledgeMap,
  getTestedIds,
  displayStats,
  listQuestions,
  recordTaskTime,
  displayTaskTimes,
}
