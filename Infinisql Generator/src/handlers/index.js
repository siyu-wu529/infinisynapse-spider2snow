/**
 * 处理器模块索引
 * 
 * 统一导出所有处理器
 */

const progress = require('./progress')
const message = require('./message')
const task = require('./task')

module.exports = {
  // 进度管理
  ...progress,
  
  // 消息处理
  handleServerMessage: message.handleServerMessage,
  handleStateMessage: message.handleStateMessage,
  handlePartialMessage: message.handlePartialMessage,
  extractToolFiles: message.extractToolFiles,
  findCompletionResult: message.findCompletionResult,
  
  // 任务处理
  buildPrompt: task.buildPrompt,
  parseDatasourceName: task.parseDatasourceName,
  queryOne: task.queryOne,
  processTask: task.processTask,
  ensureDatasource: task.ensureDatasource,
}
