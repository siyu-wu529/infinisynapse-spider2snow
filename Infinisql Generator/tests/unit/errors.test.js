/**
 * 错误类型单元测试
 */

const assert = require('assert')
const {
  AppError,
  ConnectionError,
  TimeoutError,
  ApiError,
  AuthError,
  ConfigError,
  FileError,
  DatasourceError,
  KnowledgeBaseError,
  TaskError,
  isRetryableError,
  getErrorMessage,
} = require('../../src/errors')

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
  fn()
}

// ==================== 错误类型测试 ====================

describe('AppError', () => {
  test('应该正确创建错误实例', () => {
    const error = new AppError('测试错误')
    assert.ok(error instanceof Error)
    assert.ok(error instanceof AppError)
    assert.strictEqual(error.message, '测试错误')
    assert.strictEqual(error.name, 'AppError')
  })

  test('应该支持错误代码', () => {
    const error = new AppError('测试错误', 'ERR_TEST')
    assert.strictEqual(error.code, 'ERR_TEST')
  })

  test('应该支持详细信息', () => {
    const details = { key: 'value' }
    const error = new AppError('测试错误', 'ERR_TEST', details)
    assert.deepStrictEqual(error.details, details)
  })
})

describe('ConnectionError', () => {
  test('应该继承自 AppError', () => {
    const error = new ConnectionError('连接失败')
    assert.ok(error instanceof AppError)
    assert.strictEqual(error.name, 'ConnectionError')
  })

  test('应该有默认错误代码', () => {
    const error = new ConnectionError('连接失败')
    assert.strictEqual(error.code, 'ERR_CONNECTION')
  })
})

describe('TimeoutError', () => {
  test('应该继承自 AppError', () => {
    const error = new TimeoutError('请求超时')
    assert.ok(error instanceof AppError)
    assert.strictEqual(error.name, 'TimeoutError')
  })

  test('应该有默认错误代码', () => {
    const error = new TimeoutError('请求超时')
    assert.strictEqual(error.code, 'ERR_TIMEOUT')
  })
})

describe('ApiError', () => {
  test('应该继承自 AppError', () => {
    const error = new ApiError('API 错误')
    assert.ok(error instanceof AppError)
    assert.strictEqual(error.name, 'ApiError')
  })

  test('应该支持状态码', () => {
    const error = new ApiError('API 错误', 404)
    assert.strictEqual(error.statusCode, 404)
  })
})

describe('AuthError', () => {
  test('应该继承自 AppError', () => {
    const error = new AuthError('认证失败')
    assert.ok(error instanceof AppError)
    assert.strictEqual(error.name, 'AuthError')
    assert.strictEqual(error.code, 'ERR_AUTH')
  })
})

describe('ConfigError', () => {
  test('应该继承自 AppError', () => {
    const error = new ConfigError('配置错误')
    assert.ok(error instanceof AppError)
    assert.strictEqual(error.name, 'ConfigError')
    assert.strictEqual(error.code, 'ERR_CONFIG')
  })
})

describe('FileError', () => {
  test('应该继承自 AppError', () => {
    const error = new FileError('文件错误')
    assert.ok(error instanceof AppError)
    assert.strictEqual(error.name, 'FileError')
    assert.strictEqual(error.code, 'ERR_FILE')
  })
})

describe('DatasourceError', () => {
  test('应该继承自 AppError', () => {
    const error = new DatasourceError('数据源错误')
    assert.ok(error instanceof AppError)
    assert.strictEqual(error.name, 'DatasourceError')
    assert.strictEqual(error.code, 'ERR_DATASOURCE')
  })
})

describe('KnowledgeBaseError', () => {
  test('应该继承自 AppError', () => {
    const error = new KnowledgeBaseError('知识库错误')
    assert.ok(error instanceof AppError)
    assert.strictEqual(error.name, 'KnowledgeBaseError')
    assert.strictEqual(error.code, 'ERR_KNOWLEDGE_BASE')
  })
})

describe('TaskError', () => {
  test('应该继承自 AppError', () => {
    const error = new TaskError('任务错误')
    assert.ok(error instanceof AppError)
    assert.strictEqual(error.name, 'TaskError')
    assert.strictEqual(error.code, 'ERR_TASK')
  })
})

// ==================== 辅助函数测试 ====================

describe('isRetryableError()', () => {
  test('ConnectionError 应该是可重试的', () => {
    const error = new ConnectionError('连接失败')
    assert.strictEqual(isRetryableError(error), true)
  })

  test('TimeoutError 应该是可重试的', () => {
    const error = new TimeoutError('超时')
    assert.strictEqual(isRetryableError(error), true)
  })

  test('AuthError 应该不可重试', () => {
    const error = new AuthError('认证失败')
    assert.strictEqual(isRetryableError(error), false)
  })

  test('ConfigError 应该不可重试', () => {
    const error = new ConfigError('配置错误')
    assert.strictEqual(isRetryableError(error), false)
  })

  test('普通 Error 应该不可重试', () => {
    const error = new Error('普通错误')
    assert.strictEqual(isRetryableError(error), false)
  })

  test('包含 ECONNRESET 的错误应该可重试', () => {
    const error = new Error('ECONNRESET')
    error.code = 'ECONNRESET'
    assert.strictEqual(isRetryableError(error), true)
  })

  test('包含 ETIMEDOUT 的错误应该可重试', () => {
    const error = new Error('ETIMEDOUT')
    error.code = 'ETIMEDOUT'
    assert.strictEqual(isRetryableError(error), true)
  })
})

describe('getErrorMessage()', () => {
  test('应该返回 Error 的 message', () => {
    const error = new Error('测试消息')
    assert.strictEqual(getErrorMessage(error), '测试消息')
  })

  test('应该返回字符串本身', () => {
    assert.strictEqual(getErrorMessage('字符串错误'), '字符串错误')
  })

  test('应该处理 null', () => {
    assert.strictEqual(getErrorMessage(null), '未知错误')
  })

  test('应该处理 undefined', () => {
    assert.strictEqual(getErrorMessage(undefined), '未知错误')
  })

  test('应该处理对象', () => {
    const result = getErrorMessage({ msg: '错误' })
    assert.ok(typeof result === 'string')
  })
})

// ==================== 运行测试 ====================

console.log('━'.repeat(60))
console.log('错误类型单元测试')
console.log('━'.repeat(60))

console.log('\n测试完成')
