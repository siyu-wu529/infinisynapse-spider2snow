# 数据源创建文件依赖说明

> 以下路径均指 **Infinisql Generator** 本目录（运行 `node infinisql_client.js` 或 `node src/cli.js` 时的工作目录）。

## 必需文件

### 1. `snowflake_database_setting.json` ✅
- **路径**: 本目录（Infinisql Generator）
- **用途**: 数据源配置主文件
- **必需字段**:
  - `instance_id`: 实例 ID
  - `数据源`: 数据库 ID
  - `schema`: Schema 数组（可包含带 `*` 的标记）
  - `主机地址` 或 `host_prefix`: 主机地址或凭证前缀
  - `用户名` 或通过 `host_prefix` 从凭证文件获取
  - `password` 或通过 `host_prefix` 从凭证文件获取
- **加载位置**: `src/config/datasource.js` → `loadDatasourceConfig()`

### 2. `.env` ✅
- **路径**: 本目录（Infinisql Generator）
- **用途**: 环境变量配置
- **必需字段**:
  - `AI_GATEWAY_TOKEN`: JWT Token（用于 API 认证）
- **加载位置**: `src/config/env.js` → `loadEnv()`

## 可选文件

### 3. `snowflake_credentials.json` ✅（推荐）
- **路径**: 本目录（Infinisql Generator）
- **用途**: 存储敏感凭证信息（主机、用户名、密码）
- **格式**: 
  ```json
  {
    "host_prefix": {
      "host": "xxx.snowflakecomputing.com",
      "username": "user",
      "password": "pass"
    }
  }
  ```
- **加载位置**: `src/config/credentials.js` → `loadCredentials()`
- **使用方式**: 在 `snowflake_database_setting.json` 中使用 `host_prefix` 字段引用

## 依赖关系图

```
createDatasource()
    │
    ├─→ loadDatasourceConfig()
    │       │
    │       ├─→ 读取 snowflake_database_setting.json
    │       │
    │       └─→ loadCredentials()
    │               └─→ 读取 snowflake_credentials.json（可选）
    │
    ├─→ getToken()
    │       └─→ 从 .env 读取 AI_GATEWAY_TOKEN
    │
    └─→ httpRequest()
            └─→ 使用 Token 发送 API 请求
```

## 配置字段验证

在 `createDatasource()` 函数中，会验证以下必需字段：

1. ✅ `config.original_db_id` 或 `config.name` - 数据库 ID
2. ✅ `config.host` - 主机地址
3. ✅ `config.username` - 用户名
4. ✅ `config.password` - 密码
5. ✅ `config.schema` 或 `config.main_schema` - Schema 信息

## 数据源名称构建逻辑

1. **在 `loadDatasourceConfig()` 中**:
   - 提取带 `*` 的 schema 作为 `main_schema`
   - 构建 `config.name = mainSchema ? ${dbId}_${mainSchema} : dbId`

2. **在 `createDatasource()` 中**:
   - 优先使用 `config.name`（确保一致性）
   - 如果不存在，则重新构建：`${databaseStr}_${schemaStr}`

## 常见问题

### 问题 1: 数据源名称不一致
- **原因**: `createDatasource()` 中重新构建名称，与 `loadDatasourceConfig()` 不一致
- **解决**: ✅ 已修复 - 优先使用 `config.name`

### 问题 2: 缺少必需字段
- **原因**: 配置文件中缺少必需字段
- **解决**: ✅ 已添加验证 - 会显示明确的错误信息

### 问题 3: 凭证文件未加载
- **原因**: `snowflake_credentials.json` 不存在或格式错误
- **解决**: 程序会回退到使用 `snowflake_database_setting.json` 中的直接字段

## 文件检查清单

运行 `--setup` 前，确保：

- [ ] `snowflake_database_setting.json` 存在且格式正确
- [ ] `.env` 文件存在且包含 `AI_GATEWAY_TOKEN`
- [ ] `snowflake_credentials.json` 存在（如果使用 `host_prefix`）
- [ ] 所有配置项都有必需字段

## 验证命令

```bash
# 检查文件是否存在
node -e "const fs = require('fs'); ['snowflake_database_setting.json', 'snowflake_credentials.json', '.env'].forEach(f => console.log(f, fs.existsSync(f) ? '✓' : '✗'))"

# 检查配置加载
node -e "const { loadDatasourceConfig } = require('./src/config/datasource'); const config = loadDatasourceConfig(); console.log('配置数量:', Object.keys(config).length)"
```
