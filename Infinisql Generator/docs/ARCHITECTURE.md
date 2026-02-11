# Infinisql Generator 架构文档

## 概述

Infinisql Generator 是一个 AI Gateway SQL 生成工具，用于通过 AI 自动生成 Snowflake SQL 查询和结果。

- **第一版**：根目录 `infinisql_client.js`，单体脚本，逻辑集中在一个文件。
- **第二版**：`src/` 目录，模块化重构，入口为 `src/cli.js`；本文档主要描述第二版的架构。

两版功能对齐，共用同一套配置与输出（如 `progress.json`、`infinisynapse_output_sql/` 等）。

## 目录结构

```
Infinisql Generator/
├── infinisql_client.js           # 第一版：单体主入口
├── src/                          # 第二版：模块化源代码
│   ├── cli.js                    # 第二版 CLI 入口
│   ├── index.js                  # 模块化 API 入口
│   ├── config/                   # 配置模块
│   │   ├── index.js              # 主配置导出
│   │   ├── env.js                # 环境变量管理
│   │   ├── credentials.js        # Snowflake 凭证
│   │   └── datasource.js         # 数据源配置
│   ├── state/                    # 状态管理
│   │   └── index.js              # AppState 单例
│   ├── errors/                   # 错误类型
│   │   └── index.js              # 自定义错误类
│   ├── utils/                    # 工具函数
│   │   ├── file.js               # 文件操作
│   │   ├── format.js             # 格式化工具
│   │   ├── http.js               # HTTP 请求
│   │   ├── logger.js             # 日志工具
│   │   └── index.js              # 统一导出
│   ├── services/                 # 服务层
│   │   ├── datasource.js         # 数据源服务
│   │   ├── knowledgebase.js      # 知识库服务
│   │   ├── websocket.js          # WebSocket 服务
│   │   └── index.js              # 统一导出
│   ├── handlers/                 # 处理器层
│   │   ├── progress.js           # 进度管理
│   │   ├── message.js            # 消息处理
│   │   ├── task.js               # 任务处理
│   │   └── index.js              # 统一导出
│   ├── commands/                 # 命令处理
│   │   ├── stats.js              # 统计命令
│   │   ├── setup.js              # 设置命令
│   │   ├── batch.js              # 批量处理
│   │   └── index.js              # 统一导出
│   └── server/                   # HTTP 服务
│       ├── file-save.js          # 文件保存服务
│       └── index.js              # 统一导出
├── tests/                        # 测试目录
│   ├── unit/                     # 单元测试
│   └── run-tests.js              # 测试运行器
├── docs/                         # 文档目录
├── package.json
├── README.md
├── DEPENDENCIES.md               # 依赖说明
└── WEB_SAVE_GUIDE.md             # Web 端保存到本地指南
```

## 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                           CLI Layer                              │
│                         (src/cli.js)                             │
│    ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│    │  stats   │ │  setup   │ │  batch   │ │   one    │         │
│    └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘         │
└─────────┼────────────┼────────────┼────────────┼────────────────┘
          │            │            │            │
┌─────────┼────────────┼────────────┼────────────┼────────────────┐
│         │      Commands Layer (src/commands/)  │                │
│    ┌────▼─────┐ ┌────▼─────┐ ┌────▼─────┐ ┌────▼─────┐         │
│    │ stats.js │ │ setup.js │ │ batch.js │ │ (task)   │         │
│    └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘         │
└─────────┼────────────┼────────────┼────────────┼────────────────┘
          │            │            │            │
┌─────────┼────────────┼────────────┼────────────┼────────────────┐
│         │      Handlers Layer (src/handlers/) │                 │
│         │       ┌────▼─────┐ ┌────▼─────┐ ┌────▼─────┐         │
│         │       │progress  │ │ message  │ │  task    │         │
│         │       └────┬─────┘ └────┬─────┘ └────┬─────┘         │
└─────────┼────────────┼────────────┼────────────┼────────────────┘
          │            │            │            │
┌─────────┼────────────┼────────────┼────────────┼────────────────┐
│         │      Services Layer (src/services/) │                 │
│    ┌────▼─────┐ ┌────▼─────┐ ┌────▼─────────────▼─────┐        │
│    │datasource│ │knowledge │ │     websocket          │        │
│    │ .js      │ │ base.js  │ │       .js              │        │
│    └────┬─────┘ └────┬─────┘ └──────────┬─────────────┘        │
└─────────┼────────────┼──────────────────┼───────────────────────┘
          │            │                  │
┌─────────┼────────────┼──────────────────┼───────────────────────┐
│         │      Core Layer              │                        │
│    ┌────▼─────┐ ┌────▼─────┐ ┌─────────▼─────┐ ┌──────────┐    │
│    │  config  │ │  state   │ │    utils      │ │  errors  │    │
│    └──────────┘ └──────────┘ └───────────────┘ └──────────┘    │
└─────────────────────────────────────────────────────────────────┘
          │            │                  │
          ▼            ▼                  ▼
    ┌──────────────────────────────────────────────┐
    │           External Systems                    │
    │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
    │  │ AI Gate- │  │ Snowflake│  │  File    │   │
    │  │   way    │  │ Database │  │  System  │   │
    │  └──────────┘  └──────────┘  └──────────┘   │
    └──────────────────────────────────────────────┘
```

## 模块说明

### 1. 配置模块 (`src/config/`)

管理应用程序的所有配置。

| 文件 | 职责 |
|------|------|
| `index.js` | 主配置对象 CONFIG，包含 URL、超时、路径等 |
| `env.js` | 环境变量管理，支持 `--env` 参数切换配置 |
| `credentials.js` | Snowflake 数据库凭证加载 |
| `datasource.js` | 数据源配置加载和模板生成 |

**使用示例：**
```javascript
const { CONFIG } = require('./src/config')
const { initEnv, getToken } = require('./src/config/env')

// 初始化生产环境
initEnv('production')

// 获取 Token
const token = getToken()
```

### 2. 状态管理 (`src/state/`)

使用单例模式集中管理全局状态。

**主要状态：**
- `socket` - WebSocket 连接实例
- `datasourceIdMap` - 数据源 ID 映射
- `datasourceConfigMap` - 数据源配置映射
- `stats` - 处理统计数据
- `isProcessing` - 处理状态标志

**使用示例：**
```javascript
const appState = require('./src/state')

// 设置数据源 ID
appState.setDatasourceId('MY_DB', 'ds_12345')

// 更新统计
appState.updateStats({ processed: 10, success: 8 })

// 重置状态
appState.resetTaskState()
```

### 3. 错误类型 (`src/errors/`)

定义 8 种自定义错误类型：

| 错误类型 | 用途 |
|---------|------|
| `AppError` | 基础错误类 |
| `ConnectionError` | WebSocket 连接错误 |
| `TimeoutError` | 请求/任务超时 |
| `ApiError` | HTTP API 错误 |
| `AuthError` | 认证错误 |
| `ConfigError` | 配置错误 |
| `FileError` | 文件操作错误 |
| `DatasourceError` | 数据源错误 |
| `KnowledgeBaseError` | 知识库错误 |
| `TaskError` | 任务处理错误 |

**辅助函数：**
- `isRetryableError(error)` - 判断错误是否可重试
- `getErrorMessage(error)` - 获取错误消息

### 4. 工具函数 (`src/utils/`)

通用工具函数集合。

| 文件 | 主要函数 |
|------|---------|
| `file.js` | `readJSONL`, `writeJSON`, `saveSqlFile`, `saveCsvFile`, `extractFiles` |
| `format.js` | `formatDuration`, `delay`, `truncate`, `pad` |
| `http.js` | `httpRequest`, `uploadRequest` |
| `logger.js` | `logInfo`, `logError`, `logWarn`, `logSuccess` |

### 5. 服务层 (`src/services/`)

与外部系统交互的服务。

#### datasource.js
- `createDatasource(token, config)` - 创建数据源
- `getDatasourceIdByName(token, name)` - 查询数据源
- `setupDatasources(token)` - 批量设置数据源
- `listDatasources(token)` - 列出所有数据源

#### knowledgebase.js
- `createKnowledgeBase(token, name, desc)` - 创建知识库
- `uploadFile(token, kbId, filePath)` - 上传文件
- `setupAllKnowledgeBases(token)` - 批量设置知识库

#### websocket.js
- `initSocket(token)` - 初始化 WebSocket 连接
- `reconnectSocket(token)` - 重连 WebSocket
- `sendTask(item, buildPrompt)` - 发送任务
- `startHeartbeat()` / `stopHeartbeat()` - 心跳管理

### 6. 处理器层 (`src/handlers/`)

业务逻辑处理。

#### progress.js
- `loadProgress()` / `saveProgress()` - 进度持久化
- `getTestedIds()` - 获取已测试的 ID
- `displayStats(items)` - 显示统计信息

#### message.js
- `handleServerMessage(message)` - 处理 WebSocket 消息
- `extractToolFiles(messages)` - 提取工具调用文件
- `findCompletionResult(messages)` - 查找完成消息

#### task.js
- `buildPrompt(item)` - 构建 SQL 生成提示词
- `processTask(item, progress, token)` - 处理单个任务
- `queryOne(item, token)` - 单问题查询

### 7. 命令处理 (`src/commands/`)

CLI 命令实现。

| 文件 | 命令 |
|------|------|
| `stats.js` | `--stats`, `--list`, `--tested` |
| `setup.js` | `--setup`, `--setup-kb`, `--create-ds`, `--reset-ds` |
| `batch.js` | `--batch`, `--all`, `--range` |

### 8. HTTP 服务 (`src/server/`)

可选的 HTTP 文件保存服务。

```javascript
const { startFileSaveServer } = require('./src/server')

// 启动服务
await startFileSaveServer(3001)
```

## 数据流

### 批量处理流程

```
1. CLI 解析参数
      │
      ▼
2. 加载配置和问题列表
      │
      ▼
3. 初始化 WebSocket 连接
      │
      ▼
4. 循环处理每个问题：
      │
      ├──▶ 4.1 检查数据源配置
      │         │
      │         ▼
      ├──▶ 4.2 构建 Prompt
      │         │
      │         ▼
      ├──▶ 4.3 发送到 AI Gateway
      │         │
      │         ▼
      ├──▶ 4.4 等待响应
      │         │
      │         ▼
      ├──▶ 4.5 提取 SQL/CSV
      │         │
      │         ▼
      └──▶ 4.6 保存文件和进度
      │
      ▼
5. 显示统计结果
```

### WebSocket 消息处理流程

```
WebSocket Message
      │
      ▼
handleServerMessage()
      │
      ├──▶ type: 'state'
      │         │
      │         ▼
      │    handleStateMessage()
      │         │
      │         ├──▶ 提取 taskId
      │         ├──▶ 提取工具调用文件
      │         └──▶ 检查 completion_result
      │
      └──▶ type: 'partialMessage'
                │
                ▼
           handlePartialMessage()
                │
                ├──▶ 累积响应文本
                └──▶ 检查完成状态
```

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `AI_GATEWAY_TOKEN` | JWT Token | - |
| `AI_GATEWAY_URL` | API 地址 | https://app.infinisynapse.cn |
| `FILE_SAVE_PORT` | 文件保存服务端口 | 3001 |

### 配置文件与输出

| 文件或目录 | 说明 |
|-----------|------|
| `.env` | 默认环境变量（如 AI_GATEWAY_TOKEN） |
| `.env.production` | 生产环境变量（可选） |
| `snowflake_credentials.json` | Snowflake 凭证（可选） |
| `snowflake_database_setting.json` | 数据源配置（必选） |
| `progress.json` | 运行时进度与数据源映射 |
| `knowledge_map.json` | 知识库映射 |
| `infinisynapse_output_sql/` | 生成的 SQL 输出目录 |
| `infinisynapse_output_csv/` | 生成的 CSV 输出目录 |

## 扩展指南

### 添加新命令

1. 在 `src/commands/` 创建新文件
2. 实现命令函数
3. 在 `src/commands/index.js` 导出
4. 在 `src/cli.js` 添加参数解析和路由

### 添加新服务

1. 在 `src/services/` 创建新文件
2. 实现服务函数
3. 在 `src/services/index.js` 导出

### 添加新错误类型

1. 在 `src/errors/index.js` 定义新类
2. 继承 `AppError`
3. 设置默认错误代码
4. 更新 `isRetryableError()` 如需要

## 测试

```bash
# 运行所有测试
node tests/run-tests.js

# 运行指定测试
node tests/run-tests.js utils
node tests/run-tests.js state
node tests/run-tests.js errors
```

## 版本历史

- **v2.0.0** - 模块化重构
  - 将 3541 行单体文件拆分为 20+ 个模块
  - 引入状态管理单例
  - 添加自定义错误类型
  - 支持 `--env` 环境切换
  - 添加单元测试

- **v1.0.0** - 初始版本
  - 单体 `infinisql_client.js`
