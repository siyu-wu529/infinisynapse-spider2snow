# Infinisql Generator

通过 AI Gateway 批量生成 Snowflake SQL，基于 Spider2-Snow 数据集。

## 快速开始

### 1. 配置凭证

**创建 `.env` 文件**，填入 AI Gateway Token：

```
AI_GATEWAY_TOKEN=你的JWT
```

**创建 `snowflake_credentials.json`**，复制模板并填入 Snowflake 账号：

```bash
cp snowflake_credentials.template.json snowflake_credentials.json
```

### 2. 运行

```bash
# 查看帮助
node src/cli.js --help

# 查看统计
node src/cli.js --stats

# 跑单题
node src/cli.js --one --id sf_bq001

# 随机跑 3 题
node src/cli.js --random-count 3

# 批量跑 10 题
node src/cli.js --batch 10
```

## 命令速查

### 查看信息

| 命令 | 说明 |
|------|------|
| `--help` | 查看所有命令 |
| `--stats` | 显示进度统计 |
| `--list` | 列出所有题目 |
| `--tested` | 列出已测试题目 |

### 跑题

| 命令 | 说明 |
|------|------|
| `--one --id <id>` | 跑指定题目 |
| `--one --random` | 随机跑 1 题 |
| `--random-count <n>` | 随机跑 n 题 |
| `--batch <n>` | 批量跑 n 题 |
| `--all` | 跑所有未测试题目 |
| `--resume` | 从上次中断处继续 |

### 数据源和知识库

| 命令 | 说明 |
|------|------|
| `--setup` | 创建所有数据源 |
| `--setup-kb` | 创建所有知识库 |
| `--create-ds <id>` | 为单题创建数据源 |
| `--create-kb <id>` | 为单题创建知识库 |

> 跑题时会自动创建缺失的数据源和知识库，通常不需要手动执行 `--setup`。

## 输出

- **SQL**：`infinisynapse_output_sql/<instance_id>.sql`
- **CSV**：`infinisynapse_output_csv/<instance_id>.csv`
- **进度**：`progress.json`（支持断点续传）

## 配置文件

| 文件 | 说明 |
|------|------|
| `.env` | AI Gateway Token（需自行创建） |
| `snowflake_credentials.json` | Snowflake 凭证（需自行创建） |
| `snowflake_database_setting.json` | 数据源配置（已包含） |
| `snowflake_credentials.template.json` | 凭证模板 |

## 依赖

本工具依赖 Spider2-Snow 数据集：

- `Spider2/spider2-snow/spider2-snow.jsonl` — 题目列表（547 题）
- `Spider2/spider2-snow/resource/documents/` — 知识库文档

## 更多文档

- [数据源配置说明](docs/DATASOURCE_DEPENDENCIES.md)
- [架构设计](docs/ARCHITECTURE.md)
- [开发指南](docs/DEVELOPMENT.md)
