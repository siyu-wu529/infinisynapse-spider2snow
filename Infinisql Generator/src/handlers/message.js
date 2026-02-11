/**
 * WebSocket 消息处理模块
 * 
 * 处理来自 AI Gateway 的各类消息：
 * - state 消息（任务状态更新）
 * - partialMessage 消息（部分响应）
 * - completion_result（任务完成）
 * - error 消息（错误处理）
 */

const appState = require('../state')
const { extractFiles } = require('../utils/file')

/**
 * 从消息中提取工具调用创建的文件
 * @param {Object[]} messages - 消息列表
 * @returns {Object} { sql: string, csv: string }
 */
function extractToolFiles(messages) {
  const toolFiles = { sql: '', csv: '' }
  
  for (const msg of messages) {
    // 格式1: msg.tool 字段
    if (msg.tool && msg.tool === 'newFileCreated') {
      if (msg.path && msg.content !== undefined) {
        const content = typeof msg.content === 'string' ? msg.content : String(msg.content)
        if (msg.path.endsWith('.sql') && !toolFiles.sql) {
          toolFiles.sql = content
          console.log(`  📄 从工具调用(msg.tool)直接获取 SQL: ${content.length} 字符`)
        } else if (msg.path.endsWith('.csv') && !toolFiles.csv) {
          toolFiles.csv = content
          console.log(`  📄 从工具调用(msg.tool)直接获取 CSV: ${content.length} 字符`)
        }
      }
    }
    
    // 格式2: msg 本身是工具调用对象
    if (msg.type === 'tool' || (msg.name && msg.name === 'newFileCreated')) {
      if (msg.path && msg.content !== undefined) {
        const content = typeof msg.content === 'string' ? msg.content : String(msg.content)
        if (msg.path.endsWith('.sql') && !toolFiles.sql) {
          toolFiles.sql = content
          console.log(`  📄 从工具调用(msg.type/name)直接获取 SQL: ${content.length} 字符`)
        } else if (msg.path.endsWith('.csv') && !toolFiles.csv) {
          toolFiles.csv = content
          console.log(`  📄 从工具调用(msg.type/name)直接获取 CSV: ${content.length} 字符`)
        }
      }
    }
    
    // 格式3: msg.say 是对象
    if (msg.say && typeof msg.say === 'object' && msg.say.tool === 'newFileCreated') {
      if (msg.say.path && msg.say.content !== undefined) {
        const content = msg.say.content
        if (msg.say.path.endsWith('.sql') && !toolFiles.sql) {
          toolFiles.sql = content
          console.log(`  📄 从工具调用(msg.say)直接获取 SQL: ${typeof content === 'string' ? content.length : 'object'} 字符`)
        } else if (msg.say.path.endsWith('.csv') && !toolFiles.csv) {
          toolFiles.csv = content
          console.log(`  📄 从工具调用(msg.say)直接获取 CSV: ${typeof content === 'string' ? content.length : 'object'} 字符`)
        }
      }
    }
    
    // 格式4: msg.text 中包含 JSON 格式的工具调用
    if (msg.text && typeof msg.text === 'string' && msg.text.includes('"tool":"newFileCreated"')) {
      try {
        const jsonStartPattern = /\{"tool":"newFileCreated"/g
        let startMatch
        while ((startMatch = jsonStartPattern.exec(msg.text)) !== null) {
          const startPos = startMatch.index
          let braceCount = 0
          let inString = false
          let escapeNext = false
          let endPos = startPos
          
          for (let i = startPos; i < msg.text.length; i++) {
            const char = msg.text[i]
            if (escapeNext) {
              escapeNext = false
              continue
            }
            if (char === '\\') {
              escapeNext = true
              continue
            }
            if (char === '"') {
              inString = !inString
              continue
            }
            if (!inString) {
              if (char === '{') {
                braceCount++
              } else if (char === '}') {
                braceCount--
                if (braceCount === 0) {
                  endPos = i + 1
                  break
                }
              }
            }
          }
          
          if (endPos > startPos) {
            const jsonStr = msg.text.substring(startPos, endPos)
            const jsonObj = JSON.parse(jsonStr)
            if (jsonObj.tool === 'newFileCreated' && jsonObj.path && jsonObj.content !== undefined) {
              const content = jsonObj.content
              if (jsonObj.path.endsWith('.sql') && !toolFiles.sql) {
                toolFiles.sql = content
                console.log(`  📄 从工具调用(msg.text JSON)直接获取 SQL: ${typeof content === 'string' ? content.length : 'object'} 字符`)
              } else if (jsonObj.path.endsWith('.csv') && !toolFiles.csv) {
                toolFiles.csv = content
                console.log(`  📄 从工具调用(msg.text JSON)直接获取 CSV: ${typeof content === 'string' ? content.length : 'object'} 字符`)
              }
            }
          }
        }
      } catch (e) {
        // JSON 解析失败，忽略
      }
    }
  }
  
  return toolFiles
}

/**
 * 查找 completion_result 消息
 * @param {Object[]} messages - 消息列表
 * @returns {Object} { hasCompletion, completionText, completionMsg }
 */
function findCompletionResult(messages) {
  let hasCompletion = false
  let completionText = ''
  let completionMsg = null
  
  // 从后往前查找
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.say === 'completion_result' || msg.ask === 'completion_result') {
      hasCompletion = true
      // 优先使用 say 类型的 completion_result
      if (msg.say === 'completion_result' && msg.text && !completionText) {
        completionText = msg.text
        completionMsg = msg
      } else if (!completionMsg) {
        completionMsg = msg
      }
    }
  }
  
  return { hasCompletion, completionText, completionMsg }
}

/**
 * 清理任务相关状态
 */
function clearTaskState() {
  if (appState.taskTimeout) {
    clearTimeout(appState.taskTimeout)
    appState.taskTimeout = null
  }
  if (appState.currentProgressTimer) {
    clearInterval(appState.currentProgressTimer)
    appState.currentProgressTimer = null
  }
}

/**
 * 完成任务处理
 * @param {Object} files - 提取的文件 { sql, csv }
 * @param {string} fullResponse - 完整响应文本
 * @param {Object} extra - 额外信息
 */
function resolveTask(files, fullResponse, extra = {}) {
  if (!appState.resolveCurrentTask) return
  
  const resolve = appState.resolveCurrentTask
  appState.resolveCurrentTask = null
  appState.currentTaskId = null
  clearTaskState()
  
  console.log(`  ✓ sendTask Promise 已 resolve，任务处理完成`)
  resolve({ ...files, fullResponse, ...extra })
}

/**
 * 处理 partialMessage 消息
 * @param {Object} partial - partialMessage 内容
 */
function handlePartialMessage(partial) {
  if (!partial) return
  
  // 调试模式
  if (process.env.DEBUG_WEBSOCKET === '1') {
    console.log('\n🔍 调试：收到 partialMessage:', JSON.stringify(partial, null, 2).substring(0, 500))
  }
  
  // 检查是否是 completion_result 消息（须防误判：刚发出就收到的 completion 多为上一任务的迟来消息）
  // 只认“距本次发送已过至少 10 秒”的 completion，不用“有内容”判断（内容可能来自上一题）
  if (partial.say === 'completion_result' || partial.ask === 'completion_result') {
    if (appState.resolveCurrentTask) {
      const now = Date.now()
      const sentAt = appState.taskSentAt || 0
      const elapsed = now - sentAt
      const MIN_ELAPSED_MS = 10000
      if (elapsed >= MIN_ELAPSED_MS) {
        console.log('\n ✓ 完成 (从 partialMessage 收到)')
        appState.hasCompletionResult = true
        const finalResponse = partial.text || appState.accumulatedResponse || appState.partialResponse || ''
        appState.accumulatedResponse = finalResponse
        const files = extractFiles(finalResponse)
        resolveTask(files, finalResponse)
      } else {
        if (process.env.DEBUG_WEBSOCKET === '1') {
          console.log(`\n ⏭️ 忽略过早的 completion_result（距发送 ${(elapsed/1000).toFixed(1)}s < ${MIN_ELAPSED_MS/1000}s），判定为上一任务`)
        }
      }
    }
    return
  }
  
  // 检查是否是 task 完成消息（同样只用“距发送至少 10 秒”防误判）
  if (partial.say === 'task') {
    if (appState.resolveCurrentTask) {
      const elapsed = Date.now() - (appState.taskSentAt || 0)
      if (elapsed >= 10000) {
        console.log('\n ✓ 任务完成 (从 partialMessage 收到)')
        appState.hasCompletionResult = true
        const finalResponse = appState.accumulatedResponse || appState.partialResponse || ''
        const files = extractFiles(finalResponse)
        resolveTask(files, finalResponse)
      }
    }
    return
  }
  
  // 文本累积逻辑
  if (partial.text) {
    appState.partialResponse = partial.text
    
    if (!appState.accumulatedResponse) {
      appState.accumulatedResponse = appState.partialResponse
    } else {
      // 追加新的内容（避免重复）
      if (!appState.accumulatedResponse.includes(appState.partialResponse)) {
        appState.accumulatedResponse += appState.partialResponse
      } else {
        appState.accumulatedResponse = appState.partialResponse
      }
    }
    process.stdout.write('.')
  }
}

/**
 * 处理 state 消息
 * @param {Object} message - state 消息
 */
function handleStateMessage(message) {
  const state = message.state
  
  // 提取 task_id
  if (state && state.taskId) {
    appState.currentTaskId = state.taskId
    console.log(`📌 从 WebSocket 消息获取到任务 ID: ${appState.currentTaskId}`)
  } else if (message.taskId) {
    appState.currentTaskId = message.taskId
    console.log(`📌 从消息对象获取到任务 ID: ${appState.currentTaskId}`)
  }
  
  if (!state || !state.clineMessages || state.clineMessages.length === 0) {
    return
  }
  
  // 调试模式：输出工具调用消息
  if (process.env.DEBUG_TOOLS) {
    console.log(`\n🔍 调试：检查 ${state.clineMessages.length} 条消息中的工具调用...`)
    state.clineMessages.forEach((msg, idx) => {
      if (msg.tool || (msg.say && typeof msg.say === 'object' && msg.say.tool) || 
          (msg.text && msg.text.includes('newFileCreated'))) {
        console.log(`  消息 ${idx}:`, JSON.stringify(msg, null, 2).substring(0, 500))
      }
    })
  }
  
  // 提取工具调用创建的文件
  const toolFiles = extractToolFiles(state.clineMessages)
  
  // 查找 completion_result
  const { hasCompletion, completionText, completionMsg } = findCompletionResult(state.clineMessages)
  
  // 获取最后一条消息（用于错误检查）
  const lastMsg = state.clineMessages[state.clineMessages.length - 1]
  
  if (hasCompletion) {
    const finalResponse = completionText || (completionMsg && completionMsg.text) || appState.accumulatedResponse || appState.partialResponse || ''
    const elapsed = Date.now() - (appState.taskSentAt || 0)
    if (elapsed < 10000) {
      if (process.env.DEBUG_WEBSOCKET === '1') {
        console.log(` ⏭️ 忽略 state 中过早的 completion（距发送 ${(elapsed/1000).toFixed(1)}s < 10s），判定为上一任务`)
      }
      return
    }
    console.log(' ✓ 收到 completion_result，任务完成')
    appState.hasCompletionResult = true
    appState.accumulatedResponse = finalResponse
    
    if (appState.resolveCurrentTask) {
      console.log(`  ✓ 确认任务完成，准备 resolve sendTask Promise`)
      
      // 优先使用工具调用中直接获取的文件
      let files = { sql: '', csv: '' }
      if (toolFiles.sql || toolFiles.csv) {
        files = toolFiles
        console.log(`  ✓ 使用工具调用创建的文件（原始内容，未处理）`)
      } else {
        files = extractFiles(finalResponse)
        console.log(`  ⚠️ 未找到工具调用，尝试从文本提取`)
      }
      
      // 调试信息
      if (files.sql) {
        console.log(`  📄 最终 SQL: ${files.sql.length} 字符`)
      } else {
        console.log(`  ⚠️ 未提取到 SQL`)
      }
      if (files.csv) {
        console.log(`  📄 最终 CSV: ${files.csv.length} 字符`)
      } else {
        console.log(`  ⚠️ 未提取到 CSV`)
      }
      
      // 如果仍未提取到内容，检查响应中是否包含 JSON
      if (!files.sql && !files.csv) {
        const hasJson = finalResponse.includes('"tool":"newFileCreated"')
        if (hasJson) {
          console.log(`  🔍 响应中包含 JSON 文件消息，但提取失败`)
          console.log(`  📝 响应预览: ${finalResponse.substring(0, 500)}...`)
        }
      }
      
      resolveTask(files, finalResponse)
    }
  } else if (lastMsg && (lastMsg.say === 'error' || lastMsg.ask === 'error')) {
    console.log(' ✗ AI 错误')
    appState.hasCompletionResult = true
    
    if (appState.resolveCurrentTask) {
      console.log(`  ✓ 收到错误消息，准备 resolve sendTask Promise`)
      resolveTask({ csv: null, sql: null }, '', { error: lastMsg.text })
    }
  }
}

/**
 * 主消息处理函数
 * @param {Object} message - WebSocket 消息
 */
function handleServerMessage(message) {
  // 重置重连计数并更新活动时间
  appState.reconnectAttempts = 0
  appState.updateActivity()
  
  switch (message.type) {
    case 'state':
      handleStateMessage(message)
      break
    case 'partialMessage':
      handlePartialMessage(message.partialMessage)
      break
    default:
      // 其他消息类型暂不处理
      break
  }
}

module.exports = {
  handleServerMessage,
  handleStateMessage,
  handlePartialMessage,
  extractToolFiles,
  findCompletionResult,
  clearTaskState,
  resolveTask,
}
