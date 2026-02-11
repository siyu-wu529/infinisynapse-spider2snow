/**
 * WebSocket 服务模块
 * 
 * 管理与 AI Gateway 的 WebSocket 连接：
 * - 连接初始化和管理
 * - 心跳机制
 * - 断线重连
 * - 消息发送
 */

const { io } = require('socket.io-client')
const { CONFIG } = require('../config')
const appState = require('../state')
const { ConnectionError, TimeoutError } = require('../errors')
const { delay } = require('../utils/format')

// 消息处理器（将在初始化时注入）
let messageHandler = null

/**
 * 设置消息处理器
 * @param {Function} handler - 消息处理函数
 */
function setMessageHandler(handler) {
  messageHandler = handler
}

/**
 * 启动心跳机制
 */
function startHeartbeat() {
  stopHeartbeat()
  
  appState.heartbeatTimer = setInterval(() => {
    if (appState.socket && appState.socket.connected) {
      // 发送心跳包
      appState.socket.emit('webviewMessage', { type: 'ping', timestamp: Date.now() })
      appState.updateActivity()
    } else {
      console.log('⚠️ 心跳检测: 连接已断开')
    }
  }, CONFIG.heartbeatInterval)
  
  console.log(`✓ 心跳已启动 (间隔 ${CONFIG.heartbeatInterval / 1000}s)`)
}

/**
 * 停止心跳机制
 */
function stopHeartbeat() {
  if (appState.heartbeatTimer) {
    clearInterval(appState.heartbeatTimer)
    appState.heartbeatTimer = null
  }
}

/**
 * 清理当前任务状态
 */
function clearCurrentTask() {
  if (appState.taskTimeout) {
    clearTimeout(appState.taskTimeout)
    appState.taskTimeout = null
  }
  if (appState.currentProgressTimer) {
    clearInterval(appState.currentProgressTimer)
    appState.currentProgressTimer = null
  }
  appState.accumulatedResponse = ''
  appState.partialResponse = ''
  appState.resolveCurrentTask = null
  appState.hasCompletionResult = false
}

/**
 * 清理所有资源
 */
function cleanupResources() {
  stopHeartbeat()
  clearCurrentTask()
  
  if (appState.socket) {
    appState.socket.removeAllListeners()
    if (appState.socket.connected) {
      appState.socket.disconnect()
    }
    appState.socket = null
  }
  
  console.log('ℹ️ [INFO] 资源已清理')
}

/**
 * 处理断开连接
 * @param {string} reason - 断开原因
 */
function handleDisconnect(reason) {
  console.log(`\n⚠️ WebSocket 连接断开: ${reason}`)
  stopHeartbeat()
  
  // 如果有正在进行的任务
  if (appState.resolveCurrentTask) {
    // 如果已经收到 completion_result，使用完整响应
    if (appState.hasCompletionResult && appState.accumulatedResponse) {
      console.log('  ✓ 已收到完整响应，使用完整响应')
      const { extractFiles } = require('../utils/file')
      const files = extractFiles(appState.accumulatedResponse)
      const resolve = appState.resolveCurrentTask
      appState.resolveCurrentTask = null
      clearCurrentTask()
      resolve({ ...files, fullResponse: appState.accumulatedResponse })
    } else if (reason === 'transport close' && appState.currentTaskId) {
      // 连接因超时断开，但任务可能还在服务器端运行
      console.log('  ⚠️ 连接因超时断开，但任务可能仍在服务器端运行')
      console.log(`  ⚠️ 任务 ID: ${appState.currentTaskId}，将在重连后继续等待`)
      // 不立即 resolve，等待重连后继续
    } else {
      // 其他原因断开，标记为不完整
      console.log('  ⚠️ 未收到完整响应，任务状态未知')
      const { extractFiles } = require('../utils/file')
      const response = appState.partialResponse || appState.accumulatedResponse || ''
      const files = response ? extractFiles(response) : { sql: null, csv: null }
      const resolve = appState.resolveCurrentTask
      clearCurrentTask()
      resolve({ ...files, fullResponse: response, incomplete: true, disconnected: true })
    }
  } else {
    // 没有正在进行的任务
    if (appState.isProcessing) {
      console.log('  🔄 正在批量处理中，将在下次任务时自动重连')
    }
  }
}

/**
 * 处理重连成功
 * @param {number} attemptNumber - 尝试次数
 */
function handleReconnect(attemptNumber) {
  console.log(`\n✓ WebSocket 已重连 (尝试次数: ${attemptNumber})`)
  startHeartbeat()
  appState.updateActivity()
  
  // 发送 webviewDidLaunch 消息
  if (appState.socket && appState.socket.connected) {
    appState.socket.emit('webviewMessage', { type: 'webviewDidLaunch' })
  }
  
  // 如果有正在进行的任务且未收到 completion_result，继续等待
  if (appState.resolveCurrentTask && appState.currentTaskId && !appState.hasCompletionResult) {
    console.log(`  ✓ 重连成功，继续等待任务完成 (task_id: ${appState.currentTaskId})`)
    console.log(`  ⏳ 任务可能仍在服务器端运行，等待 completion_result...`)
  }
}

/**
 * 初始化 WebSocket 连接
 * @param {string} token - JWT Token
 * @returns {Promise<Object>} socket 实例
 */
function initSocket(token) {
  return new Promise((resolve, reject) => {
    appState.socket = io(CONFIG.socketUrl, {
      ...CONFIG.socketOptions,
      auth: { Authorization: token },
    })
    
    appState.socket.on('connect', () => {
      console.log('✓ 已连接到 AI Gateway')
      appState.socket.emit('webviewMessage', { type: 'webviewDidLaunch' })
      startHeartbeat()
      appState.resetReconnectState()
      resolve(appState.socket)
    })
    
    appState.socket.on('connect_error', (error) => {
      console.error('连接失败:', error.message)
      if (error.message.includes('Authentication')) {
        reject(new ConnectionError('认证失败，请检查 Token'))
      }
    })
    
    appState.socket.on('disconnect', handleDisconnect)
    
    // 监听重连事件
    appState.socket.on('reconnect', handleReconnect)
    
    appState.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`  🔄 正在尝试重连 (${attemptNumber}/${CONFIG.socketOptions.reconnectionAttempts})...`)
    })
    
    appState.socket.on('reconnect_error', (error) => {
      console.log(`  ⚠️ 重连失败: ${error.message}`)
    })
    
    appState.socket.on('reconnect_failed', () => {
      console.log(`  ✗ 重连失败，已达到最大重试次数`)
    })
    
    // 注册消息处理器
    if (messageHandler) {
      appState.socket.on('webviewMessage', messageHandler)
    }
    
    appState.socket.connect()
  })
}

/**
 * 手动重连 WebSocket
 * @param {string} token - JWT Token
 * @returns {Promise<boolean>} 是否成功
 */
async function reconnectSocket(token) {
  if (appState.isReconnecting) return false
  appState.isReconnecting = true
  
  const maxAttempts = CONFIG.socketOptions.reconnectionAttempts
  let reconnectDelay = CONFIG.socketOptions.reconnectionDelay
  
  while (appState.reconnectAttempts < maxAttempts) {
    appState.reconnectAttempts++
    console.log(`\n🔄 尝试重连 (${appState.reconnectAttempts}/${maxAttempts})...`)
    
    try {
      await new Promise((resolve, reject) => {
        appState.socket = io(CONFIG.socketUrl, {
          ...CONFIG.socketOptions,
          auth: { Authorization: token },
        })
        
        appState.socket.on('connect', () => {
          console.log('✓ 已重连')
          appState.resetReconnectState()
          appState.updateActivity()
          appState.socket.emit('webviewMessage', { type: 'webviewDidLaunch' })
          startHeartbeat()
          
          // 如果有正在进行的任务，继续等待
          if (appState.resolveCurrentTask && appState.currentTaskId && !appState.hasCompletionResult) {
            console.log(`  ✓ 重连成功，继续等待任务完成 (task_id: ${appState.currentTaskId})`)
          }
          resolve(appState.socket)
        })
        
        appState.socket.on('connect_error', (error) => {
          console.log(`  连接失败: ${error.message}`)
          appState.socket.disconnect()
          reject(error)
        })
        
        appState.socket.on('disconnect', handleDisconnect)
        
        if (messageHandler) {
          appState.socket.on('webviewMessage', messageHandler)
        }
        
        appState.socket.connect()
      })
      
      appState.isReconnecting = false
      return true
    } catch (error) {
      console.log(`  等待 ${reconnectDelay}ms 后重试...`)
      await delay(reconnectDelay)
      reconnectDelay = Math.min(reconnectDelay * CONFIG.retry.backoffMultiplier, CONFIG.retry.maxDelay)
    }
  }
  
  appState.isReconnecting = false
  return false
}

/**
 * 发送简单任务（用于单问题查询）
 * @param {string} prompt - 提示词
 * @param {number} waitTimeout - 等待超时时间
 * @returns {Promise<Object>} 响应
 */
function sendTaskSimple(prompt, waitTimeout = CONFIG.websocketWaitTimeout) {
  return new Promise((resolve) => {
    appState.accumulatedResponse = ''
    appState.partialResponse = ''
    appState.hasCompletionResult = false
    appState.resolveCurrentTask = resolve
    
    // 生成 task_id 并记录发送时刻（用于区分“本任务完成”与“上一任务迟来的 completion”）
    appState.currentTaskId = Date.now()
    appState.taskSentAt = appState.currentTaskId
    console.log(`   任务 ID: ${appState.currentTaskId}`)
    
    // 设置超时
    appState.taskTimeout = setTimeout(() => {
      if (appState.hasCompletionResult) {
        // 已经收到完整结果
        resolve(appState.accumulatedResponse || appState.partialResponse || '')
      } else {
        // 未收到完整结果
        console.log(`\n⏰ WebSocket 等待超时（${waitTimeout / 1000} 秒），未收到完整响应`)
        resolve({ incomplete: true, response: appState.partialResponse || appState.accumulatedResponse || '' })
      }
      appState.taskTimeout = null
    }, waitTimeout)
    
    appState.socket.emit('webviewMessage', { type: 'newTask', text: prompt })
    console.log(`等待 AI 响应...（最多等待 ${waitTimeout / 1000} 秒）`)
  })
}

/**
 * 发送批量任务
 * @param {Object} item - 问题项
 * @param {Function} buildPrompt - 构建提示词的函数
 * @returns {Promise<Object>} 响应
 */
function sendTask(item, buildPrompt) {
  return new Promise((resolve) => {
    // 检查是否已有任务正在处理
    if (appState.resolveCurrentTask && appState.currentTaskId) {
      console.log(`  ⚠️ 警告：检测到上一个任务未完成（task_id: ${appState.currentTaskId}）`)
      
      const waitStartTime = Date.now()
      const maxWaitTime = CONFIG.timeout + 10000
      
      const checkInterval = setInterval(() => {
        if (!appState.resolveCurrentTask) {
          clearInterval(checkInterval)
          console.log(`  ✓ 上一个任务已完成，继续发送新任务`)
          sendNewTask()
        } else if (Date.now() - waitStartTime > maxWaitTime) {
          clearInterval(checkInterval)
          console.log(`  ⚠️ 等待上一个任务超时，强制继续`)
          
          // 清理上一个任务
          clearCurrentTask()
          const oldResolve = appState.resolveCurrentTask
          appState.resolveCurrentTask = null
          if (oldResolve) {
            oldResolve({ sql: null, csv: null, incomplete: true, replaced: true })
          }
          
          setTimeout(() => sendNewTask(), 1000)
        }
      }, 1000)
    } else {
      sendNewTask()
    }
    
    function sendNewTask() {
      appState.accumulatedResponse = ''
      appState.partialResponse = ''
      appState.hasCompletionResult = false
      appState.resolveCurrentTask = resolve
      
      // 生成 task_id
      appState.currentTaskId = Date.now()
      
      // 清除之前的进度提示定时器
      if (appState.currentProgressTimer) {
        clearInterval(appState.currentProgressTimer)
        appState.currentProgressTimer = null
      }
      
      // 添加进度提示定时器（每 2 分钟提示一次）
      let elapsedMinutes = 0
      const progressInterval = 120000
      
      appState.currentProgressTimer = setInterval(() => {
        elapsedMinutes += 2
        if (elapsedMinutes <= 20) {
          console.log(`\n⏳ 处理中... 已等待 ${elapsedMinutes} 分钟（超时时间: ${Math.floor(CONFIG.timeout / 60000)} 分钟）`)
        }
      }, progressInterval)
      
      // 设置超时
      appState.taskTimeout = setTimeout(() => {
        // 清除进度提示定时器
        if (appState.currentProgressTimer) {
          clearInterval(appState.currentProgressTimer)
          appState.currentProgressTimer = null
        }
        
        if (appState.hasCompletionResult) {
          // 已经收到完整结果，忽略超时
          appState.taskTimeout = null
          return
        }
        
        // 未收到完整结果
        if (appState.resolveCurrentTask === resolve) {
          appState.resolveCurrentTask = null
          appState.taskTimeout = null
        }
        console.log(`\n⏰ 已等待 ${Math.floor(CONFIG.timeout / 60000)} 分钟，超时`)
        resolve({ sql: null, csv: null, incomplete: true, timeout: true })
      }, CONFIG.timeout)
      
      const prompt = buildPrompt(item)
      appState.socket.emit('webviewMessage', { type: 'newTask', text: prompt })
      console.log(`处理: ${item.instance_id} (${item.db_id})`)
      console.log(`任务 ID: ${appState.currentTaskId}`)
    }
  })
}

/**
 * 检查连接状态
 * @returns {boolean} 是否已连接
 */
function isConnected() {
  return appState.socket && appState.socket.connected
}

/**
 * 断开连接
 */
function disconnect() {
  cleanupResources()
}

module.exports = {
  setMessageHandler,
  startHeartbeat,
  stopHeartbeat,
  clearCurrentTask,
  cleanupResources,
  initSocket,
  reconnectSocket,
  sendTaskSimple,
  sendTask,
  isConnected,
  disconnect,
}
