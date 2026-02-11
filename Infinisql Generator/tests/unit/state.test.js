/**
 * 状态管理单元测试
 */

const assert = require('assert')

// 由于状态是单例，需要在测试前重置
let appState

function resetState() {
  // 清除缓存的模块
  delete require.cache[require.resolve('../../src/state')]
  appState = require('../../src/state')
}

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    return true
  } catch (error) {
    console.log(`  ✗ ${name}`)
    console.log(`    ${error.message}`)
    return false
  }
}

function describe(name, fn) {
  console.log(`\n${name}`)
  resetState()
  fn()
}

// ==================== 状态管理测试 ====================

describe('AppState 初始状态', () => {
  test('socket 初始为 null', () => {
    assert.strictEqual(appState.socket, null)
  })

  test('accumulatedResponse 初始为空字符串', () => {
    assert.strictEqual(appState.accumulatedResponse, '')
  })

  test('isProcessing 初始为 false', () => {
    assert.strictEqual(appState.isProcessing, false)
  })

  test('datasourceIdMap 初始为空对象', () => {
    assert.deepStrictEqual(appState.datasourceIdMap, {})
  })

  test('stats 初始值正确', () => {
    assert.strictEqual(appState.stats.total, 0)
    assert.strictEqual(appState.stats.processed, 0)
    assert.strictEqual(appState.stats.success, 0)
    assert.strictEqual(appState.stats.failed, 0)
    assert.strictEqual(appState.stats.startTime, null)
  })
})

describe('AppState.setDatasourceId()', () => {
  test('应该设置数据源 ID', () => {
    appState.setDatasourceId('test_db', 'ds_123')
    assert.strictEqual(appState.datasourceIdMap['test_db'], 'ds_123')
  })

  test('应该覆盖已有值', () => {
    appState.setDatasourceId('test_db', 'ds_123')
    appState.setDatasourceId('test_db', 'ds_456')
    assert.strictEqual(appState.datasourceIdMap['test_db'], 'ds_456')
  })
})

describe('AppState.getDatasourceId()', () => {
  test('应该返回存在的数据源 ID', () => {
    appState.datasourceIdMap['my_db'] = 'ds_789'
    assert.strictEqual(appState.getDatasourceId('my_db'), 'ds_789')
  })

  test('应该返回 null 对于不存在的键', () => {
    assert.strictEqual(appState.getDatasourceId('nonexistent'), null)
  })
})

describe('AppState.updateStats()', () => {
  test('应该更新指定字段', () => {
    appState.updateStats({ total: 100, processed: 50 })
    assert.strictEqual(appState.stats.total, 100)
    assert.strictEqual(appState.stats.processed, 50)
  })

  test('应该保留未更新的字段', () => {
    appState.stats.success = 10
    appState.updateStats({ failed: 5 })
    assert.strictEqual(appState.stats.success, 10)
    assert.strictEqual(appState.stats.failed, 5)
  })
})

describe('AppState.resetStats()', () => {
  test('应该重置所有统计数据', () => {
    appState.stats = {
      total: 100,
      processed: 80,
      success: 70,
      failed: 10,
      startTime: Date.now(),
    }

    appState.resetStats()

    assert.strictEqual(appState.stats.total, 0)
    assert.strictEqual(appState.stats.processed, 0)
    assert.strictEqual(appState.stats.success, 0)
    assert.strictEqual(appState.stats.failed, 0)
    assert.strictEqual(appState.stats.startTime, null)
  })
})

describe('AppState.resetTaskState()', () => {
  test('应该重置任务相关状态', () => {
    appState.accumulatedResponse = 'some response'
    appState.partialResponse = 'partial'
    appState.resolveCurrentTask = () => {}
    appState.hasCompletionResult = true

    appState.resetTaskState()

    assert.strictEqual(appState.accumulatedResponse, '')
    assert.strictEqual(appState.partialResponse, '')
    assert.strictEqual(appState.resolveCurrentTask, null)
    assert.strictEqual(appState.hasCompletionResult, false)
  })
})

describe('AppState.resetReconnectState()', () => {
  test('应该重置重连相关状态', () => {
    appState.reconnectAttempts = 5
    appState.reconnectDelay = 10000
    appState.isReconnecting = true

    appState.resetReconnectState()

    assert.strictEqual(appState.reconnectAttempts, 0)
    assert.strictEqual(appState.reconnectDelay, 3000)
    assert.strictEqual(appState.isReconnecting, false)
  })
})

describe('AppState.updateActivity()', () => {
  test('应该更新最后活动时间', () => {
    const before = Date.now()
    appState.updateActivity()
    const after = Date.now()

    assert.ok(appState.lastActivityTime >= before)
    assert.ok(appState.lastActivityTime <= after)
  })
})

describe('AppState.setDatasourceConfig()', () => {
  test('应该设置数据源配置', () => {
    const config = { host: 'test.snowflake.com', database: 'TEST_DB' }
    appState.setDatasourceConfig('sf_bq001', config)
    assert.deepStrictEqual(appState.datasourceConfigMap['sf_bq001'], config)
  })
})

describe('AppState.getDatasourceConfig()', () => {
  test('应该返回存在的配置', () => {
    const config = { host: 'test.snowflake.com' }
    appState.datasourceConfigMap['sf_bq002'] = config
    assert.deepStrictEqual(appState.getDatasourceConfig('sf_bq002'), config)
  })

  test('应该返回 null 对于不存在的配置', () => {
    assert.strictEqual(appState.getDatasourceConfig('nonexistent'), null)
  })
})

// ==================== 运行测试 ====================

console.log('━'.repeat(60))
console.log('状态管理单元测试')
console.log('━'.repeat(60))

console.log('\n测试完成')
