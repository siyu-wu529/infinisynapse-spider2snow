# Infinisynapse Spider2-Snow

基于 Spider2-Snow 数据集，通过 AI Gateway 批量生成 Snowflake SQL。

## 快速开始

### 1. 配置凭证

进入 `Infinisql Generator` 目录，创建两个配置文件：

```bash
cd "Infinisql Generator"
```

**创建 `.env` 文件**（填入你的 AI Gateway Token）：

```
AI_GATEWAY_TOKEN=你的JWT
```

**创建 `snowflake_credentials.json`**（复制模板并填入 Snowflake 账号）：

```bash
cp snowflake_credentials.template.json snowflake_credentials.json
```

编辑 `snowflake_credentials.json`，填入你的 Snowflake 账号信息：

```json
{
  "YOUR_HOST_PREFIX": {
    "host": "YOUR_ACCOUNT.snowflakecomputing.com",
    "username": "YOUR_USERNAME",
    "password": "YOUR_PASSWORD"
  }
}
```

### 2. 运行

```bash
# 查看帮助
node src/cli.js --help

# 查看统计信息
node src/cli.js --stats

# 跑单题测试
node src/cli.js --one --id sf_bq001

# 随机跑 3 题
node src/cli.js --random-count 3

# 批量跑 10 题
node src/cli.js --batch 10
```

## 项目结构

```
├── Infinisql Generator/     # SQL 生成工具（主入口）
│   ├── src/                 # 源码
│   ├── .env                 # Token 配置（需自行创建）
│   ├── snowflake_credentials.json  # Snowflake 凭证（需自行创建）
│   └── snowflake_database_setting.json  # 数据源配置（已包含）
│
└── Spider2/
    └── spider2-snow/        # Spider2-Snow 数据集
        ├── spider2-snow.jsonl       # 547 道题目
        └── resource/documents/      # 知识库文档
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `node src/cli.js --help` | 查看所有命令 |
| `node src/cli.js --stats` | 显示进度统计 |
| `node src/cli.js --one --id <id>` | 跑指定题目 |
| `node src/cli.js --one --random` | 随机跑 1 题 |
| `node src/cli.js --random-count <n>` | 随机跑 n 题 |
| `node src/cli.js --batch <n>` | 批量跑 n 题 |
| `node src/cli.js --setup` | 创建所有数据源 |
| `node src/cli.js --setup-kb` | 创建所有知识库 |
| `node src/cli.js --resume` | 从上次中断处继续 |

## 输出

- **SQL 文件**：`Infinisql Generator/infinisynapse_output_sql/<instance_id>.sql`
- **CSV 结果**：`Infinisql Generator/infinisynapse_output_csv/<instance_id>.csv`

## 更多文档

- [Infinisql Generator 详细说明](Infinisql%20Generator/README.md)
- [数据源配置说明](Infinisql%20Generator/docs/DATASOURCE_DEPENDENCIES.md)
- [架构设计](Infinisql%20Generator/docs/ARCHITECTURE.md)

## 参考

- [Spider2 官方网站](https://spider2-sql.github.io/)
