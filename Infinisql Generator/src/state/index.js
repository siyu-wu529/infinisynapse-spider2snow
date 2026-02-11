/**
 * 应用状态管理模块（单例模式）
 * 
 * 集中管理所有全局状态，避免散落在各处的全局变量
 */

/**
 * 应用状态容器
 */
class AppState {
  constructor() {
    // WebSocket 相关状态
    this.socket = null
    this.accumulatedResponse = ''
    this.partialResponse = ''
    this.isProcessing = false
    this.resolveCurrentTask = null
    this.taskTimeout = null
    this.currentTaskId = null
    
    // 数据源相关状态
    this.datasourceIdMap = {}      // db_id -> datasource_id 映射
    this.datasourceConfigMap = {}  // instanceId -> 数据源连接配置
    
    // 知识库相关状态
    this.knowledgeMap = {}         // instanceId -> knowledge_id 映射
    
    // 重连相关状态
    this.reconnectAttempts = 0
    this.currentTask = null
    this.reconnectDelay = 3000
    this.isReconnecting = false
    
    // 心跳相关状态
    this.heartbeatTimer = null
    this.lastActivityTime = Date.now()
    
    // 进度相关状态
    this.currentProgressTimer = null
    this.hasCompletionResult = false
    
    // 统计数据
    this.stats = {
      total: 0,
      processed: 0,
      success: 0,
      failed: 0,
      startTime: null,
    }
  }
  
  /**
   * 重置 WebSocket 相关状态
   */
  resetSocketState() {
    this.socket = null
    this.accumulatedResponse = ''
    this.partialResponse = ''
    this.isProcessing = false
    this.resolveCurrentTask = null
    this.taskTimeout = null
    this.currentTaskId = null
  }
  
  /**
   * 重置任务相关状态
   */
  resetTaskState() {
    this.accumulatedResponse = ''
    this.partialResponse = ''
    this.resolveCurrentTask = null
    this.hasCompletionResult = false
    
    if (this.taskTimeout) {
      clearTimeout(this.taskTimeout)
      this.taskTimeout = null
    }
    
    if (this.currentProgressTimer) {
      clearInterval(this.currentProgressTimer)
      this.currentProgressTimer = null
    }
  }
  
  /**
   * 重置重连相关状态
   */
  resetReconnectState() {
    this.reconnectAttempts = 0
    this.reconnectDelay = 3000
    this.isReconnecting = false
  }
  
  /**
   * 重置统计数据
   */
  resetStats() {
    this.stats = {
      total: 0,
      processed: 0,
      success: 0,
      failed: 0,
      startTime: null,
    }
  }
  
  /**
   * 更新统计数据
   * @param {Partial<typeof this.stats>} updates - 更新的字段
   */
  updateStats(updates) {
    Object.assign(this.stats, updates)
  }
  
  /**
   * 设置数据源映射
   * @param {string} key - 键
   * @param {string} value - 值
   */
  setDatasourceId(key, value) {
    this.datasourceIdMap[key] = value
  }
  
  /**
   * 获取数据源 ID
   * @param {string} key - 键
   * @returns {string|null}
   */
  getDatasourceId(key) {
    return this.datasourceIdMap[key] || null
  }
  
  /**
   * 设置数据源配置
   * @param {string} instanceId - 实例 ID
   * @param {Object} config - 配置
   */
  setDatasourceConfig(instanceId, config) {
    this.datasourceConfigMap[instanceId] = config
  }
  
  /**
   * 获取数据源配置
   * @param {string} instanceId - 实例 ID
   * @returns {Object|null}
   */
  getDatasourceConfig(instanceId) {
    return this.datasourceConfigMap[instanceId] || null
  }
  
  /**
   * 更新最后活动时间
   */
  updateActivity() {
    this.lastActivityTime = Date.now()
  }
  
  /**
   * 清理所有资源
   */
  cleanup() {
    // 停止心跳
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    
    // 清理任务超时
    if (this.taskTimeout) {
      clearTimeout(this.taskTimeout)
      this.taskTimeout = null
    }
    
    // 清理进度定时器
    if (this.currentProgressTimer) {
      clearInterval(this.currentProgressTimer)
      this.currentProgressTimer = null
    }
    
    // 断开 socket 连接
    if (this.socket) {
      this.socket.removeAllListeners()
      if (this.socket.connected) {
        this.socket.disconnect()
      }
      this.socket = null
    }
    
    // 重置状态
    this.resetTaskState()
    this.resetReconnectState()
  }
}

// 导出单例实例
const appState = new AppState()

module.exports = appState
