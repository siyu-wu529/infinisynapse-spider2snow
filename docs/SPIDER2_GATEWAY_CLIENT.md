# Spider2 AI Gateway 客户端使用指南

> 通过 WebSocket 与 AI Gateway 多轮交互，批量生成 Snowflake SQL。  
> **实际实现位于**：`Infinisql Generator/`，主入口为 `infinisql_client.js` 或 `src/cli.js`。

---

## 快速开始

### 1. 进入客户端目录

```bash
cd "Infinisql Generator"
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置 Token

在 **Infinisql Generator** 目录下创建 `.env` 文件（可参考 `.env.example` 若有）：

```bash
# 方式一：.env 文件
AI_GATEWAY_TOKEN=your-jwt-token

# 方式二：命令行参数
node infinisql_client.js --token "your-jwt-token"
```

### 4. 运行

```bash
# 处理所有问题
node infinisql_client.js

# 只处理前 10 个
node infinisql_client.js --count 10

# 从第 100 个开始，处理 50 个
node infinisql_client.js --start 100 --count 50

# 断点续传
node infinisql_client.js --resume

# 或使用模块化 CLI
node src/cli.js --batch 20
```

---

## 命令行参数（主入口 infinisql_client.js）

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--start <n>` | 从第 n 个问题开始 | 0 |
| `--count <n>` | 处理 n 个问题 | 全部 |
| `--token <token>` | JWT Token | `.env` 中 `AI_GATEWAY_TOKEN` |
| `--resume` | 从上次中断处继续 | false |
| `--one --id <id>` | 单题按 instance_id（如 sf_bq009） | - |
| `--one --index <n>` | 单题按序号 | - |
| `--one --random` | 随机一题 | - |
| `--random-count <n>` | 随机选 n 个未测题目依次处理 | - |
| `--ids-file <path>` | 从文件读取 instance_id 列表，只处理这些 | - |
| `--setup` | 自动创建/更新数据源（据 snowflake_database_setting.json） | - |
| `--setup-kb` | 一键创建知识库并上传文档 | - |
| `--create-ds <id>` | 为单个 instance_id 创建数据源 | - |
| `--create-kb <id>` | 为单个 instance 创建知识库 | - |
| `--stats` | 显示进度统计 | - |
| `--list` / `--tested` | 列出全部/已测题目 | - |
| `--help` | 显示帮助信息 | - |

---

## 输入输出

### 输入文件

- **路径**（相对于 Infinisql Generator）：`../Spider2/spider2-snow/spider2-snow.jsonl`
- **格式**：JSONL（每行一个 JSON）

```json
{
  "instance_id": "sf_bq011",
  "instruction": "How many distinct pseudo users...",
  "db_id": "GA4",
  "external_knowledge": "ga4_obfuscated_sample_ecommerce.events.md"
}
```

### 输出文件

- **SQL 目录**：`Infinisql Generator/infinisynapse_output_sql/`（每个 instance_id 一个 `.sql`）
- **CSV 目录**：`Infinisql Generator/infinisynapse_output_csv/`（每个 instance_id 一个 `.csv`）

```
Infinisql Generator/
├── infinisynapse_output_sql/
│   ├── sf_bq001.sql
│   ├── sf_bq002.sql
│   └── ...
├── infinisynapse_output_csv/
│   ├── sf_bq001.csv
│   └── ...
├── progress.json          # 进度与数据源/知识库映射
├── knowledge_map.json     # 知识库 ID 映射
└── ...
```

### 进度与配置

- **进度文件**：`Infinisql Generator/progress.json`（断点续传、数据源映射、已测题目）
- **数据源配置**：`Infinisql Generator/snowflake_database_setting.json`（每题对应的 database/schema）
- **凭证**（可选）：`Infinisql Generator/snowflake_credentials.json`（本机 Snowflake 验证等）

---

## 数据源与知识库

首次使用建议先做一次数据源与知识库设置（依赖 `snowflake_database_setting.json` 与 Spider2 的 documents）：

```bash
cd "Infinisql Generator"

# 1. 创建所有数据源
node infinisql_client.js --setup

# 2. 创建所有知识库并上传 .md 文档（有 external_knowledge 的题）
node infinisql_client.js --setup-kb

# 3. 开始批量生成
node infinisql_client.js
```

详见：`Infinisql Generator/README.md`、`Infinisql Generator/DEPENDENCIES.md`。

---

## 多轮交互机制

1. **发送任务**：将题目（含 instruction、db_id、external_knowledge 等）发给 AI Gateway  
2. **接收响应**：从 AI 响应中解析 SQL（及可选 CSV）  
3. **保存结果**：写入 `infinisynapse_output_sql/`、`infinisynapse_output_csv/`  
4. **进度持久化**：更新 `progress.json`，支持 `--resume`

---

## 错误处理

- **连接超时**：自动重连（次数与间隔见客户端配置）  
- **任务超时**：按客户端配置超时后保存当前结果并继续  
- **中断恢复**：使用 `--resume` 从上次位置继续  
- **Token**：未传时从 `.env` 的 `AI_GATEWAY_TOKEN` 或环境变量读取

---

## 评估生成的 SQL

生成 SQL 后，使用 Spider2 官方评测脚本评估。

```bash
# 进入评测目录（项目根下）
cd Spider2/spider2-snow/evaluation_suite

# 指定 Infinisql Generator 的输出目录（相对或绝对路径）
python evaluate.py --result_dir ../../../Infinisql\ Generator/infinisynapse_output_sql --mode sql
```

Windows 下路径示例（按实际路径调整）：

```bash
python evaluate.py --result_dir "C:\Users\16158\Desktop\Spider_test\Infinisql Generator\infinisynapse_output_sql" --mode sql
```

评估脚本会输出：总题数、正确数、准确率（EX 等）、详细错误及 `log.txt`。

---

## 项目内文件结构（与本文档对应）

```
Spider_test/
├── Infinisql Generator/           # AI Gateway 客户端（本实现）
│   ├── infinisql_client.js        # 主入口
│   ├── infinisql_websocket.js    # WebSocket 封装
│   ├── src/
│   │   ├── cli.js                # 模块化 CLI 入口
│   │   ├── config/               # 配置与数据源
│   │   ├── handlers/             # 任务与进度
│   │   ├── services/             # WebSocket、数据源、知识库
│   │   └── ...
│   ├── package.json
│   ├── .env                      # AI_GATEWAY_TOKEN（需自建）
│   ├── snowflake_database_setting.json   # 数据源配置
│   ├── snowflake_credentials.json       # Snowflake 凭证（可选）
│   ├── progress.json             # 进度与映射
│   ├── knowledge_map.json
│   ├── infinisynapse_output_sql/ # SQL 输出
│   └── infinisynapse_output_csv/ # CSV 输出
│
├── Spider2/
│   └── spider2-snow/
│       ├── spider2-snow.jsonl    # 输入数据集
│       └── evaluation_suite/
│           ├── evaluate.py       # 官方评测脚本
│           └── gold/              # 标准答案
│
└── docs/
    └── SPIDER2_GATEWAY_CLIENT.md  # 本文件
```

---

## 常见问题

- **Token 无效**：确认 JWT 有效，可从 AI Gateway 控制台获取。  
- **连接失败**：检查网络与 Gateway 地址（当前为 `https://app.infinisynapse.cn/ai_gateway`）。  
- **数据源/知识库报错**：先运行 `--setup` 与 `--setup-kb`，并确认 `snowflake_database_setting.json` 与 Spider2 的 `resource/documents/` 存在。  
- **依赖 Spider2**：客户端依赖 `Spider2/spider2-snow/spider2-snow.jsonl` 和 `resource/documents/`，详见 `Infinisql Generator/DEPENDENCIES.md`。

---

**更多说明**：`Infinisql Generator/README.md`、`Infinisql Generator/DEPENDENCIES.md`、`Infinisql Generator/WEB_SAVE_GUIDE.md`
