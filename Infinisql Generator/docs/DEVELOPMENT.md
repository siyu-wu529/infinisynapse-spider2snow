# Infinisql Generator 开发指南

> 以下所有路径与命令均以 **Infinisql Generator** 本目录为工作目录。

## 快速开始

### 环境要求

- Node.js >= 14.0.0
- npm >= 6.0.0

### 安装依赖

```bash
cd "Infinisql Generator"
npm install
```

### 配置

1. 复制环境变量文件：
```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，设置 Token：
```env
AI_GATEWAY_TOKEN=your_jwt_token_here
```

3. 确保 `snowflake_credentials.json` 包含正确的凭证。

### 运行

```bash
# 使用新的 CLI 入口
node src/cli.js --help

# 显示统计
node src/cli.js --stats --token YOUR_TOKEN

# 批量处理
node src/cli.js --batch 10 --token YOUR_TOKEN

# 单问题查询
node src/cli.js --one --id sf_bq001 --token YOUR_TOKEN
```

## 项目结构

```
src/
├── cli.js          # CLI 入口（参数解析、命令路由）
├── index.js        # 模块入口（作为库使用）
├── config/         # 配置管理
├── state/          # 状态管理（单例）
├── errors/         # 自定义错误类型
├── utils/          # 工具函数
├── services/       # 外部服务交互
├── handlers/       # 业务逻辑处理
├── commands/       # CLI 命令实现
└── server/         # HTTP 服务
```

## 开发规范

### 代码风格

- 使用 2 空格缩进
- 使用单引号
- 语句末尾不加分号
- 使用 JSDoc 注释函数

```javascript
/**
 * 函数描述
 * @param {string} param1 - 参数1说明
 * @param {number} param2 - 参数2说明
 * @returns {Promise<Object>} 返回值说明
 */
async function myFunction(param1, param2) {
  // 实现
}
```

### 模块规范

每个模块文件应该：

1. 顶部有模块说明注释
2. 使用 `require` 导入依赖
3. 定义私有函数（不导出）
4. 定义公共函数（导出）
5. 文件末尾使用 `module.exports` 导出

```javascript
/**
 * 模块名称
 * 
 * 模块功能描述
 */

const dep1 = require('...')
const dep2 = require('...')

// 私有函数
function privateHelper() {
  // ...
}

// 公共函数
function publicFunction() {
  // ...
}

module.exports = {
  publicFunction,
}
```

### 错误处理

使用自定义错误类型：

```javascript
const { ConnectionError, TimeoutError, isRetryableError } = require('../errors')

try {
  await someOperation()
} catch (error) {
  if (isRetryableError(error)) {
    // 重试逻辑
  } else {
    throw new ConnectionError('操作失败', error)
  }
}
```

### 状态管理

使用全局状态单例：

```javascript
const appState = require('../state')

// 读取状态
const dsId = appState.getDatasourceId('MY_DB')

// 更新状态
appState.setDatasourceId('MY_DB', 'ds_123')

// 重置状态
appState.resetTaskState()
```

### 日志规范

使用统一的日志工具：

```javascript
const { logInfo, logError, logWarn, logSuccess } = require('../utils/logger')

logInfo('开始处理任务')
logSuccess('任务完成')
logWarn('配置缺失，使用默认值')
logError('处理失败', error)
```

## 测试

### 运行测试

```bash
# 运行所有测试
node tests/run-tests.js

# 运行指定测试
node tests/run-tests.js utils
```

### 编写测试

在 `tests/unit/` 目录下创建测试文件：

```javascript
// tests/unit/mymodule.test.js

const assert = require('assert')
const { myFunction } = require('../../src/mymodule')

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (error) {
    console.log(`  ✗ ${name}`)
    console.log(`    ${error.message}`)
  }
}

function describe(name, fn) {
  console.log(`\n${name}`)
  fn()
}

describe('myFunction()', () => {
  test('应该正确处理输入', () => {
    const result = myFunction('input')
    assert.strictEqual(result, 'expected')
  })
})
```

## 常见任务

### 添加新的 CLI 命令

1. 在 `src/commands/` 创建或编辑文件
2. 实现命令函数
3. 在 `src/commands/index.js` 导出
4. 在 `src/cli.js` 添加参数和路由

```javascript
// src/commands/mycommand.js
async function myCommand(token, options) {
  console.log('执行我的命令')
  // 实现逻辑
}

module.exports = { myCommand }

// src/commands/index.js
const { myCommand } = require('./mycommand')
module.exports = {
  // ...existing
  myCommand,
}

// src/cli.js parseArgs()
case '--my-command':
  options.myCommand = true
  break

// src/cli.js main()
if (options.myCommand) {
  await commands.myCommand(token, options)
  process.exit(0)
}
```

### 添加新的服务

1. 在 `src/services/` 创建新文件
2. 实现服务函数
3. 在 `src/services/index.js` 导出

```javascript
// src/services/myservice.js
const { CONFIG } = require('../config')
const { httpRequest } = require('../utils/http')

async function fetchData(token, params) {
  const url = `${CONFIG.apiUrl}/v1/myendpoint`
  return await httpRequest(url, token, 'GET')
}

module.exports = { fetchData }

// src/services/index.js
const myservice = require('./myservice')
module.exports = {
  // ...existing
  myservice,
  fetchData: myservice.fetchData,
}
```

### 修改配置

1. 编辑 `src/config/index.js` 添加新配置项
2. 如需环境特定配置，编辑 `.env` 文件

```javascript
// src/config/index.js
const defaultConfig = {
  // ...existing
  myNewOption: process.env.MY_NEW_OPTION || 'default_value',
}
```

## 调试

### 启用调试模式

```bash
# WebSocket 调试
DEBUG_WEBSOCKET=1 node src/cli.js --batch 1 --token YOUR_TOKEN

# 工具调用调试
DEBUG_TOOLS=1 node src/cli.js --batch 1 --token YOUR_TOKEN
```

### 查看日志

日志会写入到配置的日志文件（如果启用）：

```javascript
const { logger } = require('./src/utils')

// 初始化日志文件
logger.init('./logs/app.log')
```

## 故障排除

### 连接问题

1. 检查 Token 是否有效
2. 检查网络连接
3. 查看 WebSocket 错误消息

### 数据源问题

1. 检查 `snowflake_database_setting.json` 配置
2. 检查凭证是否正确
3. 使用 `--list-ds` 查看已创建的数据源

### 任务超时

1. 检查 `CONFIG.timeout` 设置
2. 检查网络稳定性
3. 考虑增加超时时间

## 发布

### 版本更新

1. 更新 `package.json` 版本号
2. 更新 `src/cli.js` 中的 VERSION
3. 更新 `docs/ARCHITECTURE.md` 版本历史
4. 提交更改

```bash
git add .
git commit -m "chore: bump version to x.x.x"
git tag vx.x.x
git push && git push --tags
```
