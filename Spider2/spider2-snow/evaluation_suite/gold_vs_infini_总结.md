# Infini SQL 无法在 Snowflake 跑通/结果错误 — 总结

> 基于 gold/sql 与 infini_output_sql 交集 12 题的对比。评测在 Snowflake 上执行 SQL，并与 gold/exec_result 逐行比对。

---

## 1. 交集题目与 db_id

| 题号 | db_id | 题号 | db_id |
|------|--------|------|--------|
| sf_bq033 | PATENTS | sf_bq209 | PATENTS |
| sf_bq091 | PATENTS | sf_bq210 | PATENTS |
| sf_bq099 | PATENTS | sf_bq213 | PATENTS |
| sf_bq127 | **PATENTS_GOOGLE** | sf_bq216 | **PATENTS_GOOGLE** |
| sf_bq128 | **PATENTSVIEW** | sf_bq221 | PATENTS |
| — | — | sf_bq222, sf_bq223 | PATENTS |

---

## 2. 五大类原因（含对策）

### 2.1 方言不是 Snowflake（影响最大）

**现象**：大量 Hive/Spark/BigQuery 语法，Snowflake 不兼容。

| Infini 常见写法 | Snowflake 应写成 |
|-----------------|------------------|
| `get_json_object(col,'$.path')` | `col:"path"::STRING` 或 `GET(col,path)` |
| `explode(from_json(...))`、`LATERAL VIEW EXPLODE` | `LATERAL FLATTEN(input => col)` |
| `` `列名` `` | `"列名"` |
| `RLIKE`、`to_date(...,'yyyyMMdd')` | `REGEXP_LIKE`、`TO_DATE(...,'YYYYMMDD')` / `TRY_TO_DATE` |
| `collect_set()`、`array_join()`、`sort_array()` | `ARRAY_AGG(DISTINCT ...)`、`LISTAGG`、`ARRAY_SORT` 等 |
| `SELECT ... AS step_name`（多段“步骤”） | 一条 SQL，用 `WITH cte AS (...)` |

**对策**：生成目标明确为 Snowflake；禁止使用 `get_json_object`、`explode`、`from_json`、`LATERAL VIEW`、`collect_set`、`array_join`、`RLIKE` 等。

---

### 2.2 库/表名不符合 Snowflake 实际

**现象**：评测按题目的 `db_id` 连库，表需为 **"数据库"."Schema"."表"** 三段式，且库/表名要对。

| 错误示例 | 正确示例（按 db_id） |
|----------|----------------------|
| `PUBLICATIONS`、`PATENTS_PUBLICATIONS` | `"PATENTS"."PATENTS"."PUBLICATIONS"` |
| `PATENTS_GOOGLE_PUBLICATIONS` | `"PATENTS_GOOGLE"."PATENTS_GOOGLE"."PUBLICATIONS"` |
| sf_bq127 用 PATENTS | 本题 db_id=**PATENTS_GOOGLE**，应用其 PUBLICATIONS |
| sf_bq128 用 PATENTS_USPTO_* | 本题 db_id=**PATENTSVIEW**，用 APPLICATION/PATENT/USPATENTCITATION 等 |
| sf_bq216 只写 PUBLICATIONS | 还需 `"PATENTS_GOOGLE"."PATENTS_GOOGLE"."ABS_AND_EMB"` |

**对策**：用 spider2-snow.jsonl 的 instance_id→db_id 定库；按 db_id 维护「库.schema.表」列表，生成时只允许该库下的三段式表名。

---

### 2.3 业务逻辑/题意理解偏差

**现象**：语法、表名都对了，但筛选条件、时间窗口、统计口径与 gold 不一致，导致结果错。

| 题号 | 常见偏差 | Gold 要点 |
|------|----------|-----------|
| sf_bq033 | 用 publication_date、abstract 当标量 LIKE | 用 **filing_date** 20080101–20221231；抽象在 **LATERAL FLATTEN(abstract_localized)** 的 `value:"text"` 里 LIKE '%internet of things%'；输出列与 exec_result 一致 |
| sf_bq209 | application_kind='U'、DATEADD(year,10,...) | utility 为 **'A'**；10 年用 **filing_date + 100000**（YYYYMMDD） |
| sf_bq091 | 两条查询、RLIKE 匹配 CPC | 单条 SQL，**LATERAL FLATTEN(cpc/ipc)** 取 value:"code" LIKE 'A61%'，并展开 assignee |
| sf_bq216 | 用 CPC 重叠当“技术相似” | 用 **embedding 向量相似度**，表 `ABS_AND_EMB.embedding_v1` |
| sf_bq127 | 用 PATENTS、未算 cited/citing families | 用 **PATENTS_GOOGLE**，算 families_cited / families_citing，输出列与 gold 一致 |
| sf_bq128 | 用 PATENTS 系表 | 用 **PATENTSVIEW** 的 APPLICATION/PATENT/CPC_CURRENT/USPATENTCITATION 等 |

**对策**：严格按题目与 external_knowledge 写 utility/application_kind/日期窗口/前后向引用定义；对齐 gold 的筛选、JOIN 与输出列。

---

### 2.4 输出列名、顺序与“空结果”约定

**现象**：评测对执行结果与 `gold/exec_result/<id>.csv` 做列级比对，列名、顺序、是否补 0 都会影响通过。

**对策**：列名与顺序对齐 csv；是否忽略顺序看 `gold/spider2snow_eval.jsonl` 的 `ignore_order`；如 sf_bq033 要包含「无申请记录的月份」并补齐 0。

---

### 2.5 多语句或非法结构

**现象**：  
- sf_bq099：多段 `SELECT ... AS step_name` 在 Snowflake 中非法，应改成一条 `WITH cte1 AS (...), cte2 AS (...) SELECT ...`。  
- sf_bq091：两条独立 SELECT 不能当一条跑；且应单条查询返回一个年份。

**对策**：每题只输出一条可单独执行的 Snowflake SQL，多步逻辑用 CTE。

---

## 3. 12 题速查（问题类型 + 优先级）

| 题号 | 主要问题 | 优先级 |
|------|----------|--------|
| sf_bq033 | 表/库名、FLATTEN 抽象、月份序列、输出列 | 高 |
| sf_bq091 | Hive/BQ 全句、表名、需单条 Snowflake + FLATTEN | 高 |
| sf_bq099 | “SELECT…AS 步骤”非法、explode/from_json | 高 |
| sf_bq127 | 库应为 PATENTS_GOOGLE、explode/collect_set 等 | 高 |
| sf_bq128 | 库应为 PATENTSVIEW、表结构完全不同 | 高 |
| sf_bq209 | application_kind 'U'→'A'、10 年窗口写法 | 中 |
| sf_bq210 | 核对 claims 不含 “claim” 的字段与条件 | 中 |
| sf_bq213 | explode/from_json→FLATTEN、表名 | 高 |
| sf_bq216 | 表名、相似度须用 embedding | 高 |
| sf_bq221 | get_json_object、表名、需 CPC_DEFINITION | 高 |
| sf_bq222 | 若仍为 Hive/Spark 或错误库，同 sf_bq221 | 中 |
| sf_bq223 | 库表、JSON 展开方式按 gold | 中 |

---

## 4. 落地动作清单

1. **Snowflake 唯一**：prompt/约束中写明「只生成 Snowflake SQL」；做本地方言过滤（出现 get_json_object/explode/LATERAL VIEW/RLIKE 等即判需重写）。
2. **按 db_id 绑定表**：为每个 db_id 维护 Snowflake 的 database.schema.table 列表；生成时只允许该库下的三段式表名。
3. **以 Gold 为参照**：表引用、LATERAL FLATTEN、日期与枚举条件、输出列名向 gold 与 `gold/exec_result/*.csv` 对齐。
4. **用足 external_knowledge**：对 sf_bq213/221/216 等题，把对应 md 要点（embedding、EMA、CPC first+level5 等）注入生成上下文。
5. **单条可执行**：每题输出一条 Snowflake SQL，多步用 WITH；不与多条独立 SELECT 混在一起。

---

*详细题例与原文对照见 `gold_vs_infini_对比分析.md`。*
