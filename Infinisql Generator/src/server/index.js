/**
 * 服务器模块索引
 * 
 * 导出所有服务器相关功能
 */

const fileSave = require('./file-save')

module.exports = {
  fileSave,
  startFileSaveServer: fileSave.start,
}
