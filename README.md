# Spider_test 项目

> 基于 Spider2 数据集的 Text2SQL：通过 **Infinisql Generator** 连接 AI Gateway 批量生成 Snowflake SQL，使用 **Spider2** 官方评测，可选 **snowflake_connector** 工具。

---

## 项目组成

### 1. Infinisql Generator（主入口）

通过 WebSocket 与 AI Gateway 交互，按 Spider2-Snow 题目批量生成 Snowflake SQL 与 CSV。

- **位置**：`Infinisql Generator/`
- **入口**：`node infinisql_client.js` 或 `node src/cli.js`
- **输入**：`Spider2/spider2-snow/spider2-snow.jsonl`
- **输出**：`Infinisql Generator/infinisynapse_output_sql/`、`infinisynapse_output_csv/`
- **配置**：同目录 `.env`（AI_GATEWAY_TOKEN）、`snowflake_database_setting.json`、`progress.json`、`knowledge_map.json`

```bash
cd "Infinisql Generator"
npm install
# 创建 .env，设置 AI_GATEWAY_TOKEN=你的JWT
node infinisql_client.js --setup
node infinisql_client.js --count 10
```

详见：**`Infinisql Generator/README.md`**、**`docs/SPIDER2_GATEWAY_CLIENT.md`**。

### 2. Spider2 数据集

- **位置**：`Spider2/`
- **spider2-snow/**：547 题，纯 Snowflake，供 Infinisql Generator 使用；评测脚本在 `evaluation_suite/`
- **spider2-lite/**：547 题，多库
- **spider2-dbt/**：68 题，DBT

### 3. 工具

- **位置**：`tools/infinisynapse-tools/`
- **内容**：仅 **snowflake_connector**（Snowflake 连接与评测，Go）。见该目录下 `README.md`。

### 4. 文档

| 文档 | 说明 |
|------|------|
| [README.md](README.md) | 本文件 |
| [FOLDER_STRUCTURE.md](FOLDER_STRUCTURE.md) | 目录结构 |
| [PROJECT_INDEX.md](PROJECT_INDEX.md) | 根目录索引 |
| [docs/SPIDER2_GATEWAY_CLIENT.md](docs/SPIDER2_GATEWAY_CLIENT.md) | AI Gateway 客户端使用说明 |
| [Infinisql Generator/README.md](Infinisql%20Generator/README.md) | Infinisql Generator 使用与依赖 |

---

## 快速开始

```bash
cd "Infinisql Generator"
npm install
# .env 中配置 AI_GATEWAY_TOKEN
node infinisql_client.js --setup
node infinisql_client.js --count 10
```

评测生成的 SQL：

```bash
cd Spider2/spider2-snow/evaluation_suite
python evaluate.py --result_dir "路径/到/Infinisql Generator/infinisynapse_output_sql" --mode sql
```

---

## 配置与忽略

- Infinisql Generator：`.env`、`snowflake_credentials.json`、`snowflake_database_setting.json`、`progress.json`、`knowledge_map.json`。  
  - 勿提交 `.env` 与真实凭证；仓库中提供 `snowflake_credentials.template.json`，请复制为 `snowflake_credentials.json` 并填入自己的账号密码。
- Spider2：`Spider2/spider2-snow/evaluation_suite/snowflake_credential.json` 同样只在本地保留真实文件；  
  - 仓库中提供 `snowflake_credential.template.json`，请复制为 `snowflake_credential.json` 并填入自己的账号信息。
- 运行时日志（如 `*.log`）已由 `.gitignore` 忽略。见 `.gitignore`。

---

## 参考

- Spider2：<https://spider2-sql.github.io/>
- 数据集与评测：`Spider2/README.md`
