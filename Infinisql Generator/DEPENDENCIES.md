# Infinisql Generator 依赖说明

> 本目录**依赖**项目内其它路径的文件如下。缺少任一项会影响对应功能。

---

## 一、依赖项目内其它目录/文件（外部依赖）

### 1. Spider2 数据集（必选）

以下路径相对于 **Spider_test** 项目根目录，即 `Infinisql Generator` 的上一级。

| 路径 | 用途 | 使用位置 |
|------|------|----------|
| **Spider2/spider2-snow/spider2-snow.jsonl** | 题目列表（instance_id、db_id、instruction、external_knowledge 等） | `infinisql_client.js`、`src/config/index.js` |
| **Spider2/spider2-snow/resource/documents/** | 外部知识文档（.md），知识库上传时读取 | `infinisql_client.js`（docsDir）、`src/config/index.js`（docsDir）、`src/services/knowledgebase.js` |
| **Spider2/spider2-snow/evaluation_suite/sampled_20_instance_ids.txt** | 抽样 20 题 ID 列表（npm 脚本用） | `package.json` 的 `run:sampled20`、`run:sampled20:src` |

**结论**：**Infinisql Generator 强依赖 `Spider2/spider2-snow/`**。若把本目录单独拷贝到别处，需同时保留至少：
- `Spider2/spider2-snow/spider2-snow.jsonl`
- `Spider2/spider2-snow/resource/documents/`（做知识库上传或带 external_knowledge 的题时需要）

---

## 二、本目录内依赖（运行/配置所需）

以下文件在 **Infinisql Generator** 目录内，被代码直接读取或写入。

### 2.1 配置与凭证（必选）

| 文件 | 说明 | 使用位置 |
|------|------|----------|
| **.env** | 环境变量：`AI_GATEWAY_TOKEN`（或 `TOKEN`）等；dotenv 从**本目录**加载 | `infinisql_client.js`、`src/config/env.js` |
| **snowflake_database_setting.json** | 每题对应的 Snowflake database/schema 等配置 | `infinisql_client.js`、`src/config/index.js`、`src/config/datasource.js` |
| **snowflake_credentials.json** | Snowflake 登录凭证（可选，用于本机验证等） | `infinisql_client.js`、`src/config/index.js` |

### 2.2 运行时生成/持久化（由脚本写入，后续会被读）

| 文件 | 说明 | 使用位置 |
|------|------|----------|
| **progress.json** | 进度、数据源映射、已测题目等 | `infinisql_client.js`、`src/` 下 progress、setup、batch、task 等 |
| **knowledge_map.json** | 知识库 ID 与 instance 的映射 | `infinisql_client.js`、`src/config/index.js`、`src/commands/setup.js`、`src/services/knowledgebase.js` |
| **knowledge_base.json** | 知识库创建/列表结果的详细缓存（部分流程写入） | `infinisql_client.js`、`src/services/knowledgebase.js` |

### 2.3 输出目录（脚本写入，路径在配置里）

| 路径 | 说明 | 使用位置 |
|------|------|----------|
| **infinisynapse_output_sql/** | 生成的 SQL 文件 | `src/config/index.js`（legacyPaths）、`src/server/file-save.js`、`infinisql_client.js` |
| **infinisynapse_output_csv/** | 生成的 CSV 结果 | 同上 |

---

## 三、不依赖的项（仅说明）

- **项目根目录**的 `config.json`、`knowledge_base.json`、`knowledge_map.json`：本目录**不读**它们；本目录只读/写**自己目录下**的配置与 progress/knowledge 文件。
- **Infinisql Generator 自身**不依赖项目根目录下的任何脚本，仅依赖本目录与 Spider2 路径。

---

## 四、依赖关系简表

```
Infinisql Generator
├── 依赖项目内
│   └── Spider2/spider2-snow/
│       ├── spider2-snow.jsonl
│       ├── resource/documents/
│       └── evaluation_suite/sampled_20_instance_ids.txt   （仅 npm 脚本用）
│
└── 依赖本目录内
    ├── .env
    ├── snowflake_database_setting.json
    ├── snowflake_credentials.json    （可选）
    ├── progress.json                 （运行后生成/更新）
    ├── knowledge_map.json
    └── knowledge_base.json            （部分流程写入）
```

---

**总结**：**Infinisql Generator** 依赖 **1）Spider2/spider2-snow 下的题目与文档**，以及 **2）本目录下的 .env、snowflake_database_setting.json、progress/knowledge 等**。单独拷贝本目录到其它仓库使用时，需要一起带上或重建上述 Spider2 路径与配置。
