/**
 * 服务模块索引
 * 
 * 统一导出所有服务
 */

const datasource = require('./datasource')
const knowledgebase = require('./knowledgebase')
const websocket = require('./websocket')

module.exports = {
  // 数据源服务
  datasource,
  getDatasourceIdByName: datasource.getDatasourceIdByName,
  createDatasource: datasource.createDatasource,
  setupDatasources: datasource.setupDatasources,
  listDatasources: datasource.listDatasources,
  ensureDatasourceForBatch: datasource.ensureDatasourceForBatch,
  
  // 知识库服务
  knowledgebase,
  getKnowledgeBaseInfo: knowledgebase.getKnowledgeBaseInfo,
  createKnowledgeBase: knowledgebase.createKnowledgeBase,
  uploadFile: knowledgebase.uploadFile,
  createKnowledge: knowledgebase.createKnowledge,
  setupAllKnowledgeBases: knowledgebase.setupAllKnowledgeBases,
  
  // WebSocket 服务
  websocket,
  initSocket: websocket.initSocket,
  reconnectSocket: websocket.reconnectSocket,
  sendTask: websocket.sendTask,
  sendTaskSimple: websocket.sendTaskSimple,
  isConnected: websocket.isConnected,
  disconnect: websocket.disconnect,
}
