/**
 * 命令模块索引
 * 
 * 统一导出所有命令处理函数
 */

const stats = require('./stats')
const setup = require('./setup')
const batch = require('./batch')

module.exports = {
  // 统计命令
  showStats: stats.showStats,
  showList: stats.showList,
  showTested: stats.showTested,
  
  // 设置命令
  setupAllDatasources: setup.setupAllDatasources,
  createSingleDatasource: setup.createSingleDatasource,
  createDatasourcesFromIdsFile: setup.createDatasourcesFromIdsFile,
  setupAllKnowledgeBases: setup.setupAllKnowledgeBasesCmd,
  createSingleKnowledgeBase: setup.createSingleKnowledgeBase,
  uploadToKnowledgeBase: setup.uploadToKnowledgeBase,
  listAllDatasources: setup.listAllDatasources,
  showDatasourceConfig: setup.showDatasourceConfig,
  resetDatasourceMap: setup.resetDatasourceMap,
  resetAllMappings: setup.resetAllMappings,
  
  // 批量处理命令
  runBatch: batch.runBatch,
  runAll: batch.runAll,
  runRange: batch.runRange,
  runSingle: batch.runSingle,
}
