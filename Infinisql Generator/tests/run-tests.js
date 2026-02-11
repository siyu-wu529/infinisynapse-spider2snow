#!/usr/bin/env node
/**
 * 测试运行器
 * 
 * 用法:
 *   node tests/run-tests.js           # 运行所有测试
 *   node tests/run-tests.js utils     # 运行指定测试
 */

const path = require('path')
const fs = require('fs')

// 测试文件目录
const testDir = path.join(__dirname, 'unit')

// 收集测试结果
const results = {
  passed: 0,
  failed: 0,
  errors: [],
}

// 解析命令行参数
const args = process.argv.slice(2)
const filterPattern = args[0] || ''

// 获取测试文件列表
function getTestFiles() {
  if (!fs.existsSync(testDir)) {
    console.error('测试目录不存在:', testDir)
    process.exit(1)
  }

  const files = fs.readdirSync(testDir)
    .filter(f => f.endsWith('.test.js'))
    .filter(f => !filterPattern || f.includes(filterPattern))

  return files.map(f => path.join(testDir, f))
}

// 运行单个测试文件
function runTestFile(filePath) {
  const fileName = path.basename(filePath)
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`运行测试: ${fileName}`)
  console.log('═'.repeat(60))

  try {
    // 清除模块缓存，确保每次运行都是新的
    delete require.cache[require.resolve(filePath)]
    require(filePath)
    return true
  } catch (error) {
    console.error(`\n❌ 测试文件执行失败: ${fileName}`)
    console.error(`   ${error.message}`)
    if (error.stack) {
      console.error(`   ${error.stack.split('\n').slice(1, 3).join('\n   ')}`)
    }
    results.errors.push({ file: fileName, error: error.message })
    return false
  }
}

// 主函数
function main() {
  console.log('━'.repeat(60))
  console.log('Infinisql Generator 单元测试')
  console.log('━'.repeat(60))

  const startTime = Date.now()
  const testFiles = getTestFiles()

  if (testFiles.length === 0) {
    console.log('\n没有找到测试文件')
    if (filterPattern) {
      console.log(`  过滤条件: ${filterPattern}`)
    }
    process.exit(0)
  }

  console.log(`\n找到 ${testFiles.length} 个测试文件`)

  // 运行所有测试文件
  let successCount = 0
  for (const file of testFiles) {
    if (runTestFile(file)) {
      successCount++
    }
  }

  // 输出总结
  const duration = Date.now() - startTime
  console.log('\n' + '━'.repeat(60))
  console.log('测试结果总结')
  console.log('━'.repeat(60))
  console.log(`  测试文件: ${testFiles.length}`)
  console.log(`  成功: ${successCount}`)
  console.log(`  失败: ${testFiles.length - successCount}`)
  console.log(`  耗时: ${duration}ms`)

  if (results.errors.length > 0) {
    console.log('\n错误详情:')
    results.errors.forEach((err, idx) => {
      console.log(`  ${idx + 1}. ${err.file}: ${err.error}`)
    })
  }

  console.log('━'.repeat(60))

  // 退出码
  process.exit(testFiles.length - successCount > 0 ? 1 : 0)
}

main()
