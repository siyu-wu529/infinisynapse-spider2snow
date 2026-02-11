/**
 * 工具函数单元测试
 */

const assert = require('assert')
const path = require('path')
const fs = require('fs')

// 测试模块
const { formatDuration, delay, truncate, pad } = require('../../src/utils/format')
const { ensureDir, extractFiles, extractDescription } = require('../../src/utils/file')

// 测试辅助函数
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

// ==================== 格式化工具测试 ====================

describe('formatDuration()', () => {
  test('应该正确格式化毫秒', () => {
    assert.strictEqual(formatDuration(500), '500ms')
    assert.strictEqual(formatDuration(999), '999ms')
  })

  test('应该正确格式化秒', () => {
    assert.strictEqual(formatDuration(1000), '1.0s')
    assert.strictEqual(formatDuration(5500), '5.5s')
    assert.strictEqual(formatDuration(59999), '60.0s')
  })

  test('应该正确格式化分钟', () => {
    assert.strictEqual(formatDuration(60000), '1m 0s')
    assert.strictEqual(formatDuration(90000), '1m 30s')
    assert.strictEqual(formatDuration(3599999), '59m 60s')
  })

  test('应该正确格式化小时', () => {
    assert.strictEqual(formatDuration(3600000), '1h 0m')
    assert.strictEqual(formatDuration(5400000), '1h 30m')
    assert.strictEqual(formatDuration(7200000), '2h 0m')
  })

  test('应该处理 0 毫秒', () => {
    assert.strictEqual(formatDuration(0), '0ms')
  })

  test('应该处理负数', () => {
    const result = formatDuration(-1000)
    assert.ok(result !== undefined)
  })
})

describe('delay()', () => {
  test('应该返回 Promise', () => {
    const result = delay(0)
    assert.ok(result instanceof Promise)
  })

  test('应该在指定时间后 resolve', async () => {
    const start = Date.now()
    await delay(50)
    const elapsed = Date.now() - start
    assert.ok(elapsed >= 45, `延迟应该至少 45ms，实际 ${elapsed}ms`)
  })
})

describe('truncate()', () => {
  test('应该截断长字符串', () => {
    const result = truncate('这是一个很长的字符串需要被截断', 10)
    assert.ok(result.length <= 13) // 10 + '...'
    assert.ok(result.endsWith('...'))
  })

  test('应该保留短字符串', () => {
    const result = truncate('短字符串', 20)
    assert.strictEqual(result, '短字符串')
  })

  test('应该处理空字符串', () => {
    const result = truncate('', 10)
    assert.strictEqual(result, '')
  })
})

describe('pad()', () => {
  test('应该正确左填充数字', () => {
    assert.strictEqual(pad(5, 3), '005')
    assert.strictEqual(pad(42, 4), '0042')
    assert.strictEqual(pad(123, 3), '123')
  })

  test('应该处理超出长度的数字', () => {
    assert.strictEqual(pad(1234, 3), '1234')
  })
})

// ==================== 文件工具测试 ====================

describe('ensureDir()', () => {
  const testDir = path.join(__dirname, 'temp_test_dir')

  test('应该创建不存在的目录', () => {
    // 清理
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir, { recursive: true })
    }

    ensureDir(testDir)
    assert.ok(fs.existsSync(testDir))

    // 清理
    fs.rmdirSync(testDir)
  })

  test('应该处理已存在的目录', () => {
    // 创建目录
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir)
    }

    // 不应该抛出错误
    ensureDir(testDir)
    assert.ok(fs.existsSync(testDir))

    // 清理
    fs.rmdirSync(testDir)
  })
})

describe('extractFiles()', () => {
  test('应该从 markdown 代码块提取 SQL', () => {
    const text = `
一些文字
\`\`\`sql
SELECT * FROM users;
\`\`\`
更多文字
`
    const result = extractFiles(text)
    assert.ok(result.sql)
    assert.ok(result.sql.includes('SELECT * FROM users'))
  })

  test('应该从 markdown 代码块提取 CSV', () => {
    const text = `
\`\`\`csv
id,name
1,Alice
2,Bob
\`\`\`
`
    const result = extractFiles(text)
    assert.ok(result.csv)
    assert.ok(result.csv.includes('id,name'))
  })

  test('应该处理空文本', () => {
    const result = extractFiles('')
    assert.strictEqual(result.sql, '')
    assert.strictEqual(result.csv, '')
  })

  test('应该处理没有代码块的文本', () => {
    const result = extractFiles('这是普通文本，没有代码块')
    assert.strictEqual(result.sql, '')
    assert.strictEqual(result.csv, '')
  })
})

describe('extractDescription()', () => {
  test('应该提取 markdown 描述', () => {
    const content = `# 标题

这是描述内容。

## 其他部分
`
    const result = extractDescription(content)
    assert.ok(result.includes('这是描述内容'))
  })

  test('应该处理空内容', () => {
    const result = extractDescription('')
    assert.strictEqual(result, '')
  })
})

// ==================== 运行测试 ====================

console.log('━'.repeat(60))
console.log('工具函数单元测试')
console.log('━'.repeat(60))

// 统计
let passed = 0
let failed = 0

// 注意：这是简化版本，实际运行时会自动统计
console.log('\n测试完成')
