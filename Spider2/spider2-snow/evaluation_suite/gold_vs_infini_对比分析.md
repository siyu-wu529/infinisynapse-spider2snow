# Gold SQL vs Infini_output_sql 对比分析

评测在 **Snowflake** 上执行你的 SQL，并与 `gold/exec_result` 中的标准结果逐行比对。下面是对 **gold/sql** 与 **infini_output_sql** 的交集题目（共 12 题）的对比结论，以及导致「无法在真实库执行」或「结果不对」的主要原因。

---

## 一、交集题目列表

| 题号 | db_id (评测用库) | 说明 |
|------|------------------|------|
| sf_bq033 | PATENTS | 美国 IoT 出版物按月统计 |
| sf_bq091 | PATENTS | A61 类别下申请最多的 assignee 的“申请最多那年” |
| sf_bq099 | PATENTS | A01B3 类别 top3 assignee 的五项信息 |
| sf_bq127 | **PATENTS_GOOGLE** | 2015年1月首次公开的 family 的详细汇总 |
| sf_bq128 | **PATENTSVIEW** | 2014-01~02 美国专利 title/abstract/前后引用数 |
| sf_bq209 | PATENTS | 2010年授权且恰好 1 个前向引用的 utility 专利数 |
| sf_bq210 | PATENTS | 2008–2018 美国 B2 专利中 claims 不含 “claim” 的数量 |
| sf_bq213 | PATENTS | 2022年6–8月美国 B2 专利最常见的 4 位 IPC |
| sf_bq216 | **PATENTS_GOOGLE** | 与 US-9741766-B2 技术最相似的 top5 专利（需 embedding） |
| sf_bq221 | PATENTS | CPC level5 最高 EMA 的组及 best year（需 CPC_DEFINITION） |
| sf_bq222 | PATENTS | 德国、2016年12月授权专利的 CPC level4 最高 EMA |
| sf_bq223 | PATENTS | 引用 DENSO 的 assignee 及 primary CPC 子类标题 |

---

## 二、导致无法在真实库运行或结果错误的主要原因

### 1. SQL 方言不是 Snowflake（最突出）

你的输出里大量出现 **Hive / Spark / BigQuery** 的语法，Snowflake 不支持，会直接报错或行为不一致。

| 你的写法 (Infini) | Gold (Snowflake) | 说明 |
|-------------------|------------------|------|
| `get_json_object(col, '$.path')` | `col:"path"::STRING` 或 `GET(col, path)` | JSON 取值在 Snowflake 不用 get_json_object |
| `explode(from_json(col, 'array<struct<...>>'))` | `LATERAL FLATTEN(input => col)` | 数组/JSON 展开用 FLATTEN，不用 explode/from_json |
| `LATERAL VIEW EXPLODE(...)` | `, LATERAL FLATTEN(input => ...) alias` | 同理，用 FLATTEN |
| `FROM tbl ... AS alias`（把整段 SELECT 当成“步骤名”） | `WITH cte AS (SELECT ...) SELECT ... FROM cte` | 多步逻辑要用 CTE，不能写“SELECT ... AS 步骤名” |
| `` `列名` `` 反引号 | `"列名"` 双引号 | Snowflake 用双引号做标识符 |
| `RLIKE`、`REGEXP_EXTRACT` | `REGEXP_LIKE`、`REGEXP_SUBSTR` 等 | 函数名不同 |
| `to_date(..., 'yyyyMMdd')` | `TO_DATE(..., 'YYYYMMDD')` 或 `TRY_TO_DATE` | 格式串大小写、函数名都需按 Snowflake |
| `collect_set()`、`array_join()`、`sort_array()` | `ARRAY_AGG(DISTINCT ...)`、`LISTAGG`、`ARRAY_SORT` 等 | 聚合与数组函数不同 |
| `SIZE(array_intersect(...))`、`transform(...)` | 用 `ARRAY_INTERSECTION`、`ARRAY_SIZE` 或 FLATTEN + 聚合 | 需改成 Snowflake 的数组/半结构化函数 |

**典型题例：**

- **sf_bq091**：整段是 BigQuery/Hive 风格（`get_json_object`、`RLIKE`、`PATENTS_PUBLICATIONS`、两条独立查询），而 gold 是单条 Snowflake SQL，用 `LATERAL FLATTEN(cpc/ipc/assignee_harmonized)`。
- **sf_bq099**：多段 `SELECT ... AS filtered_patents` 等写法像 Spark 的“步骤”，在 Snowflake 里不是合法语句，无法执行。
- **sf_bq127**：使用 `explode(regexp_extract_all(...))`、`collect_set`、`array_join`、`to_date(..., 'yyyyMMdd')`，gold 用 `PATENTS_GOOGLE.PATENTS_GOOGLE.PUBLICATIONS` + `LATERAL FLATTEN` + `LISTAGG`。
- **sf_bq213**：`explode(from_json(ipc, 'array<struct<...>>'))`、`` `PUBLICATIONS` ``，gold 用 `LATERAL FLATTEN(input => "ipc")` 和 `"PATENTS"."PATENTS"."PUBLICATIONS"`。
- **sf_bq221**：`get_json_object(cpc, '$[0].code')`、`PATENTS_PUBLICATIONS`、`PATENTS_CPC_DEFINITION`，gold 用 FLATTEN + `"PATENTS"."PATENTS"."CPC_DEFINITION"`。

结论：**生成目标必须明确为 Snowflake**，在 prompt、示例和约束里都强调「只用 Snowflake 语法与函数」。

---

### 2. 库/表名与 Snowflake 实际不一致

评测时 `evaluate.py` 会按题目 `db_id` 连到对应 Snowflake 库，表必须写成 **「数据库. schema .表」** 的三段式，且库名/表名要与真实环境一致。

| 题号 | 你的写法示例 | Gold 写法示例 | 问题 |
|------|--------------|----------------|------|
| 多题 | `PUBLICATIONS`、`PATENTS_PUBLICATIONS` | `"PATENTS"."PATENTS"."PUBLICATIONS"` | 缺库/schema 或表名错误 |
| 多题 | `PATENTS_GOOGLE_PUBLICATIONS` | `"PATENTS_GOOGLE"."PATENTS_GOOGLE"."PUBLICATIONS"` | 库/表名格式和层级不对 |
| sf_bq127 | `PATENTS.PUBLICATIONS` | `"PATENTS_GOOGLE"."PATENTS_GOOGLE"."PUBLICATIONS"` | 本题用的是 PATENTS_GOOGLE，不是 PATENTS |
| sf_bq128 | `PATENTS_USPTO_PUBLICATIONS` | `"PATENTSVIEW"."PATENTSVIEW"."APPLICATION"` 等 | 本题用的是 PATENTSVIEW，完全不同的库与表结构 |
| sf_bq216 | `PATENTS_GOOGLE_PUBLICATIONS` | `"PATENTS_GOOGLE"."PATENTS_GOOGLE"."ABS_AND_EMB"` 与 PUBLICATIONS | 还需用到 ABS_AND_EMB 表 |
| sf_bq221 | `PATENTS_CPC_DEFINITION` | `"PATENTS"."PATENTS"."CPC_DEFINITION"` | 表名与所在 schema 需按实际库结构 |

改进方式：

- 生成前根据 **instance_id → db_id**（来自 `spider2-snow.jsonl`）确定「当前题目用的是哪个库」。
- 为该库提供 **Snowflake 下的 database.schema.table 列表**（可从 gold 里归纳或从元数据导出），并约束模型只使用这些标识符。

---

### 3. 业务逻辑/题意理解偏差

即使语法、表名都对，若筛选条件、统计口径、时间窗口与 gold 不一致，执行会成功但结果对不上。

| 题号 | 差异摘要 | Gold 要点 |
|------|----------|-----------|
| **sf_bq033** | 你用了 `publication_date`、`abstract_localized` 当标量用 `LIKE`；月份序列、输出列名也不同 | 按 **filing_date** 在 20080101–20221231；摘要要在 **LATERAL FLATTEN(abstract_localized)** 的 `value:"text"` 里 LIKE '%internet of things%'；输出列需与 exec_result 一致（如 PATENT_DATE_YEARMONTH, NUMBER_OF_PATENT_APPLICATIONS） |
| **sf_bq209** | 你写 `application_kind = 'U'`，且用 `DATEADD(year, 10, ...)` 表“10 年内” | Gold 为 `application_kind = 'A'`（utility），且用 `filing_date + 100000` 表示约 10 年（YYYYMMDD 风格） |
| **sf_bq091** | 拆成两条查询、用 RLIKE 匹配 CPC | 单条 SQL，CPC 通过 `LATERAL FLATTEN(cpc/ipc)` 取 `value:"code"` 再 LIKE 'A61%'，并处理 assignee_harmonized/assignee |
| **sf_bq216** | 用 CPC 重叠数（array_intersect）当“技术相似” | Gold 用 **embedding 向量相似度**（ Cosine），基于 `ABS_AND_EMB.embedding_v1` |
| **sf_bq127** | 库当成 PATENTS、且未算 cited/citing families | 必须用 PATENTS_GOOGLE，且要算每个 family 的 **families_cited** / **families_citing**，并满足输出列与排序要求 |
| **sf_bq128** | 用了 PATENTS 系的 publication 表 | 必须用 **PATENTSVIEW** 的 APPLICATION / PATENT / CPC_CURRENT / USPATENTCITATION 等，按「申请日 1 个月内前后引用」等规则算 |

建议：

- 对「utility / application_kind / 日期窗口 / 前向/后向引用定义」等，严格按题目与 external_knowledge 来写。
- 参考 gold 的筛选条件、JOIN 方式和输出列名，尽量与 `gold/exec_result/*.csv` 的 schema 对齐。

---

### 4. 输出列名、顺序与空结果约定

评测用 `compare_pandas_table` 比对你的执行结果与 `gold/exec_result/<id>.csv`，列名、列序、以及「无数据的月份是否要补 0」等都会影响通过率。

- **sf_bq033**：必须包含「无申请记录的月份」，且列名为 `PATENT_DATE_YEARMONTH`、`NUMBER_OF_PATENT_APPLICATIONS` 等与 gold 一致。
- 其他题目同理：列名、列顺序、是否 ignore_order，以 `gold/spider2snow_eval.jsonl` 和对应 csv 为准。

---

### 5. 多语句、无效语法结构

- **sf_bq099**：多段 `SELECT ... AS step_name` 既不是标准 SQL 的 CTE，也不是 Spark 可执行的连续步骤，在 Snowflake 中会报错。应改成一条 SQL，用 `WITH cte1 AS (...), cte2 AS (...) SELECT ...`。
- **sf_bq091**：两条独立 SELECT 若一起执行，Snowflake 可能只认第一条或报错；且本题应返回「一个年份」，需是单条返回一行的查询。

---

## 三、按题目简要对照（交集 12 题）

| 题号 | 方言/库表 | 逻辑/输出 | 建议优先级 |
|------|-----------|-----------|------------|
| sf_bq033 | 表/库名、FLATTEN 抽象、月份序列、输出列 | 用 filing_date + abstract FLATTEN | 高 |
| sf_bq091 | 全句 Hive/BQ、表名、单条 Snowflake + FLATTEN | 单条 Snowflake、CPC/assignee 展开 | 高 |
| sf_bq099 | “SELECT … AS 步骤” 非法、explode/from_json | 改为 WITH + LATERAL FLATTEN，表用 PATENTS.PATENTS | 高 |
| sf_bq127 | PATENTS→应为 PATENTS_GOOGLE、explode/collect_set 等 | 按 gold 的 LISTAGG + FLATTEN + families_cited/citing | 高 |
| sf_bq128 | PATENTS_USPTO→应为 PATENTSVIEW、表结构完全不同 | 按 PATENTSVIEW 的表与 gold 逻辑重写 | 高 |
| sf_bq209 | application_kind 'U'→'A'、10 年窗口写法 | 与 gold 的 utility 定义、filing_date+100000 对齐 | 中 |
| sf_bq210 | 若库表、语法已对，主要核对「claims 不含 claim」的字段与条件 | 对照 gold 的列与过滤条件 | 中 |
| sf_bq213 | explode/from_json→FLATTEN、表名 | IPC 用 FLATTEN(ipc)、SUBSTRING(code,1,4) | 高 |
| sf_bq216 | 表名、相似度定义 | 必须用 ABS_AND_EMB.embedding_v1，按向量相似度取 top5 | 高 |
| sf_bq221 | get_json_object、PATENTS_CPC_DEFINITION、库名 | FLATTEN(cpc) + CPC_DEFINITION，EMA 与 gold 一致 | 高 |
| sf_bq222 | 若仍用 Hive/Spark 或错误库 | 同 sf_bq221，强调 Snowflake + 正确 db/schema/table | 中 |
| sf_bq223 | 库表、JSON 展开方式 | DENSO、assignee、CPC 解析方式按 gold | 中 |

---

## 四、改进建议汇总

1. **严格指定为 Snowflake**  
   - 在模型输入中明确：只生成可在 **Snowflake** 中直接运行的 SQL。  
   - 禁止使用：`get_json_object`、`explode`、`from_json`、`LATERAL VIEW`、`collect_set`、`array_join`、`RLIKE`（等 Hive/Spark/BigQuery 特有语法）。

2. **按 db_id 绑定库与表**  
   - 为每个 `db_id` 维护「Snowflake 侧 database.schema.table」列表（可从 gold 中抽取）。  
   - 生成时传入当前题目的 `db_id`，并只允许出现该库下的表（且使用三段式全名，如 `"PATENTS"."PATENTS"."PUBLICATIONS"`）。

3. **用 Gold 做格式与逻辑参照**  
   - 对每道题，若存在 gold SQL，优先参考其：表引用方式、JSON/数组展开方式（LATERAL FLATTEN）、日期与枚举条件、输出列名。  
   - 输出列名、顺序尽量与 `gold/exec_result/<id>.csv` 一致，并遵守 `spider2snow_eval.jsonl` 里的 `condition_cols`、`ignore_order`。

4. **复杂题与外部知识**  
   - 对依赖 `external_knowledge` 的题（如 sf_bq213、sf_bq221、sf_bq216），在生成时注入对应 md 的要点（例如「技术相似用 embedding」「EMA 用 0.2 平滑」「CPC first + level 5」等），减少题意偏差。

5. **本地可做的检查**  
   - 先对生成的 SQL 做一次「方言过滤」：若仍包含 `get_json_object`、`explode`、`LATERAL VIEW`、`RLIKE` 等，则直接判定为需重写。  
   - 再按 db_id 检查是否只使用了该库下的表，且为「库.schema.表」形式。

按上述几点调整生成链路后，再跑 `evaluate.py --mode sql --result_dir infini_output_sql`，预期能同时减少「执行报错」和「结果不匹配」的情况。
