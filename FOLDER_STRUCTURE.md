# Spider_test 项目文件结构

> 当前仓库**实际**目录与文件布局。

---

## 根目录树

```
Spider_test/
│
├── .github/
│   └── copilot-instructions.md
├── .gitignore
│
├── docs/
│   └── SPIDER2_GATEWAY_CLIENT.md      # AI Gateway 客户端使用说明
│
├── Infinisql Generator/               # SQL 生成（主入口）
│   ├── src/                            # 模块化源码（cli、config、handlers、services 等）
│   ├── docs/                           # ARCHITECTURE、DATASOURCE_DEPENDENCIES 等
│   ├── tests/
│   ├── infinisql_client.js             # 主入口
│   ├── infinisql_websocket.js
│   ├── file_save_server.js
│   ├── package.json, package-lock.json
│   ├── .env, snowflake_database_setting.json, snowflake_credentials.json
│   ├── progress.json, knowledge_map.json, knowledge_base.json
│   ├── infinisynapse_output_sql/
│   ├── infinisynapse_output_csv/
│   ├── README.md, DEPENDENCIES.md, WEB_SAVE_GUIDE.md 等
│   └── ...
│
├── Spider2/                            # Spider2 官方数据集与评测
│   ├── spider2-lite/
│   ├── spider2-snow/                   # 与 Infinisql Generator 配合
│   ├── spider2-dbt/
│   └── ...
│
├── tools/
│   └── infinisynapse-tools/
│       ├── README.md
│       └── snowflake_connector/
│
├── README.md
├── FOLDER_STRUCTURE.md                 # 本文件
├── PROJECT_INDEX.md
└── requirements.txt                   # 可选 Python 依赖（如 Spider2 评测）
```

---

## 核心目录

### Infinisql Generator/

- **用途**：按 Spider2-Snow 通过 AI Gateway 批量生成 Snowflake SQL。
- **入口**：`node infinisql_client.js` 或 `node src/cli.js`。
- **依赖**：本目录 `.env`、`snowflake_database_setting.json`；项目内 `Spider2/spider2-snow/spider2-snow.jsonl` 与 `resource/documents/`。
- **输出**：`infinisynapse_output_sql/`、`infinisynapse_output_csv/`。

### Spider2/

- **用途**：Spider2 数据集与官方评测。**spider2-snow/** 为 Infinisql Generator 题目与文档来源；评测在 `evaluation_suite/`。

### docs/

- 仅 **SPIDER2_GATEWAY_CLIENT.md**（Gateway 客户端使用说明）。

### tools/infinisynapse-tools/

- 仅 **snowflake_connector**（Snowflake 连接与评测，Go）。

---

## 文档导航

| 需求 | 文档 |
|------|------|
| 项目总览 | [README.md](README.md) |
| 目录结构 | 本文件 |
| 根目录索引 | [PROJECT_INDEX.md](PROJECT_INDEX.md) |
| Gateway 客户端 | [docs/SPIDER2_GATEWAY_CLIENT.md](docs/SPIDER2_GATEWAY_CLIENT.md) |
| Infinisql 使用与依赖 | [Infinisql Generator/README.md](Infinisql%20Generator/README.md)、[DEPENDENCIES.md](Infinisql%20Generator/DEPENDENCIES.md) |
