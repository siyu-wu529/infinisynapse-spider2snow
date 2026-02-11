# Infinisql Generator（第二版说明）

通过 WebSocket 与 AI Gateway 交互，按 Spider2-Snow 题目批量生成 Snowflake SQL 与 CSV。本文档针对 **第二版（模块化）**，入口为 `node src/cli.js`。第一版为根目录单体脚本 `infinisql_client.js`，功能与第二版对齐，配置与输出目录共用。

---

## 前置准备

1. **一键安装依赖（在本目录执行）**  
   环境要求：Node.js ≥ 16，建议使用 `nvm` 或系统自带 Node。  
   ```bash
   # 进入 Infinisql Generator 目录后，仅需执行一次
   npm install
   ```

2. **配置 Token**  
   在本目录创建 `.env`，写入：  
   `AI_GATEWAY_TOKEN=你的JWT`  
   也可命令行传入：`node src/cli.js --token "你的JWT"`。

3. **数据源配置**  
   本目录需存在 `snowflake_database_setting.json`（每题对应的 Snowflake database/schema）。  
   凭证建议按以下方式配置：  
   - 复制 `snowflake_credentials.template.json` 为 `snowflake_credentials.json`，填入自己的 Snowflake 账号信息；  
   - 运行脚本时会从 `snowflake_credentials.json` 中按 `host_prefix` 或主机地址读取用户名/密码。

---

## 第二版入口与推荐流程

**入口：**
```bash
node src/cli.js [选项]
node src/cli.js --help
```

**推荐流程（首次使用）：**
```bash
# 1. 先用单题 / 少量随机题验证链路（推荐）
node src/cli.js --one --id sf_bq001          # 指定一题
node src/cli.js --one --random               # 随机 1 题
node src/cli.js --random-count 3             # 连续随机 3 题

# 2. 跑小批量问题
node src/cli.js --batch 10                   # 批量 10 题

# 3. （可选）一次性批量创建数据源和知识库
node src/cli.js --setup                      # 按 setting 创建/刷新所有数据源
node src/cli.js --setup-kb                   # 为所有 external_knowledge 创建知识库并上传文档

# 说明：所有跑题命令在需要时都会自动按题目创建缺失的数据源，并按 external_knowledge 自动创建/检查知识库
```

---

## 第二版命令详细说明

以下命令均在 **Infinisql Generator** 目录下执行，形式为 `node src/cli.js <选项>`。未写 `--token` 时从本目录 `.env` 的 `AI_GATEWAY_TOKEN` 读取。

---

### 一、Token 与环境

| 选项 | 说明 | 示例 |
|------|------|------|
| `--token <token>` | 传入 JWT；不传则从 .env 或环境变量 `AI_GATEWAY_TOKEN` 读取 | `node src/cli.js --token "eyJ..." --stats` |
| `--env <name>` | 使用指定环境配置（如 production、dev） | `node src/cli.js --env production --batch 10` |

---

### 二、统计与查看

| 选项 | 说明 | 示例 |
|------|------|------|
| `--stats` | 显示进度统计（总题数、已测数、成功率等） | `node src/cli.js --stats` |
| `--list` | 列出所有题目（instance_id 等） | `node src/cli.js --list` |
| `--tested` | 列出已测试的题目 | `node src/cli.js --tested` |

---

### 三、数据源管理

| 选项 | 说明 | 示例 |
|------|------|------|
| `--setup` | 设置所有数据源（根据 snowflake_database_setting.json，自动清理并重新创建） | `node src/cli.js --setup` |
| `--create-ds <id>` | 为单个 instance_id 创建数据源 | `node src/cli.js --create-ds sf_bq009` |
| `--list-ds` | 列出 AI Gateway 中已有数据源 | `node src/cli.js --list-ds` |
| `--ds-config` / `--show-config` | 显示数据源配置模板（字段说明） | `node src/cli.js --show-config` |
| `--reset-ds` | 清除本地数据源映射，便于重新创建 | `node src/cli.js --reset-ds` |
| `--reset-all` | 清除所有本地映射（数据源 + 知识库） | `node src/cli.js --reset-all` |

---

### 四、知识库管理

| 选项 | 说明 | 示例 |
|------|------|------|
| `--setup-kb` | 一键创建所有知识库并上传 .md 文档（自动清理本地映射） | `node src/cli.js --setup-kb` |
| `--create-kb <id>` | 为单个 instance 创建知识库并上传对应 md | `node src/cli.js --create-kb sf_bq009` |
| `--upload-kb <kb_id> <filename>` | 上传文件到已有知识库 | `node src/cli.js --upload-kb <uuid> ga4_xxx.md` |

---

### 五、批量处理

| 选项 | 说明 | 默认/备注 | 示例 |
|------|------|-----------|------|
| `--batch [count]` | 批量处理 count 个问题（**自动按需创建缺失的数据源和外部知识库**） | 不写 count 时默认 10 | `node src/cli.js --batch 20` |
| `--all` | 处理所有未测试的问题（**自动按需创建缺失的数据源和外部知识库**） | - | `node src/cli.js --all` |
| `--ids-file <path>` | 从文件读取 instance_id 列表（每行一个），只处理这些题（**自动按需创建缺失的数据源和外部知识库**） | 路径可为相对本目录或绝对路径 | `node src/cli.js --ids-file ../Spider2/spider2-snow/evaluation_suite/sampled_20_instance_ids.txt` |
| `--setup-ds-ids` | 仅创建 --ids-file 中题目涉及的数据源，不跑生成任务 | 需与 `--ids-file` 同时使用 | `node src/cli.js --ids-file path/to/ids.txt --setup-ds-ids` |
| `--resume` | 从上次中断处继续（跳过 progress 中已完成的） | - | `node src/cli.js --resume` |
| `--random-count <n>` | 随机选择 n 个未测试问题并依次处理 | - | `node src/cli.js --random-count 5` |
| `--start <n>` | 从第 n 个问题开始（与 --ids-file 同时使用时无效） | 默认 0 | `node src/cli.js --batch 50 --start 10` |
| `--skip-tested` | 跳过已测试的问题（默认行为） | 默认开启 | `node src/cli.js --batch 10 --skip-tested` |
| `--no-skip-tested` | 不跳过已测试的问题，可重复跑 | - | `node src/cli.js --batch 10 --no-skip-tested` |

---

### 六、单题查询

| 选项 | 说明 | 示例 |
|------|------|------|
| `--one` | 进入单题查询模式，需配合 `--id`、`--index` 或 `--random` 之一（**同样会自动按需创建缺失的数据源和外部知识库**） | - |
| `--id <id>` | 按 instance_id 指定一题 | `node src/cli.js --one --id sf_bq001` |
| `--index <n>` | 按序号指定一题（从 0 开始） | `node src/cli.js --one --index 0` |
| `--random [count]` | 随机选一题或 count 题（不写 count 默认为 1） | `node src/cli.js --one --random` 或 `node src/cli.js --one --random 3` |

---

### 七、其他

| 选项 | 说明 | 示例 |
|------|------|------|
| `--help` / `-h` | 显示帮助信息 | `node src/cli.js --help` |
| `--version` / `-v` | 显示版本号 | `node src/cli.js --version` |

---

### 常用命令示例汇总

```bash
node src/cli.js --stats
node src/cli.js --setup
node src/cli.js --setup-kb
node src/cli.js --batch 20
node src/cli.js --one --id sf_bq001
node src/cli.js --one --random 2
node src/cli.js --ids-file path/to/sampled_20_instance_ids.txt
node src/cli.js --ids-file path/to/ids.txt --setup-ds-ids
node src/cli.js --resume
node src/cli.js --random-count 5
node src/cli.js --create-kb sf_bq009
node src/cli.js --upload-kb <kb_id> filename.md
node src/cli.js --env production --batch 10
```

---

## 输入与输出

- **输入**：`../Spider2/spider2-snow/spider2-snow.jsonl`（相对于本目录）
- **SQL 输出**：`./infinisynapse_output_sql/<instance_id>.sql`
- **CSV 输出**：`./infinisynapse_output_csv/<instance_id>.csv`
- **进度与映射**：`progress.json`、`knowledge_map.json`（断点续传与数据源/知识库 ID 映射）

---

## 数据源配置

主配置为本目录 `snowflake_database_setting.json`，格式与字段说明见 **`docs/DATASOURCE_DEPENDENCIES.md`**。凭证可放在 `snowflake_credentials.json`，通过 `host_prefix` 引用。

---

## 依赖路径

- `Spider2/spider2-snow/spider2-snow.jsonl` — 题目列表  
- `Spider2/spider2-snow/resource/documents/` — 知识库 .md 文档  

详见 **`DEPENDENCIES.md`**。

---

## 文档索引

| 文档 | 说明 |
|------|------|
| **README.md** | 本文件，第二版使用与命令说明 |
| **DEPENDENCIES.md** | 依赖的项目路径与本目录配置 |
| **WEB_SAVE_GUIDE.md** | Web 端通过本地服务保存 SQL/CSV |
| **docs/ARCHITECTURE.md** | 模块化架构与目录结构 |
| **docs/DEVELOPMENT.md** | 开发规范与测试 |
| **docs/DATASOURCE_DEPENDENCIES.md** | 数据源配置与字段说明 |
| **docs/GATEWAY_USAGE_SPEC.md** | AI Gateway 透传规范 |
| **项目根 docs/SPIDER2_GATEWAY_CLIENT.md** | 项目级 Gateway 客户端说明 |
