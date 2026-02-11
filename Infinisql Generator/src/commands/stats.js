/**
 * 统计命令模块
 * 
 * 处理 --stats, --list, --tested 等统计相关命令
 */

const { displayStats, listQuestions, getTestedIds, displayTaskTimes, loadProgress } = require('../handlers/progress')

/**
 * 显示进度统计
 * @param {Object[]} items - 问题列表
 */
function showStats(items) {
  const testedIds = getTestedIds()
  displayStats(items, testedIds)
  
  // 显示任务时间统计
  const progress = loadProgress()
  displayTaskTimes(progress)
}

/**
 * 列出所有问题
 * @param {Object[]} items - 问题列表
 */
function showList(items) {
  const testedIds = getTestedIds()
  listQuestions(items, testedIds)
}

/**
 * 显示已测试的问题
 */
function showTested() {
  const testedIds = getTestedIds()
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
}

module.exports = {
  showStats,
  showList,
  showTested,
}
