# Infini 输出与 Spider2-Snow Gold 标答对比 — 整理版

**说明**：本文档将「infini_output_sql / infini_output_csv」与「gold/sql、gold/exec_result」的差异整理为一份可执行、可检索的对照说明，用于排查「SQL 跑不通 / 结果判错」及「CSV 结构、格式与标答不一致」两类问题。

**涉及目录**：
- 预测 SQL：`evaluation_suite/infini_output_sql/`
- 预测 CSV：`evaluation_suite/infini_output_csv/`
- 标答 SQL：`evaluation_suite/gold/sql/`
- 标答 CSV：`evaluation_suite/gold/exec_result/`
- 评测规则：`evaluation_suite/gold/spider2snow_eval.jsonl`（`condition_cols`、`ignore_order`）

---

## 一、SQL 层：为何无法在 Snowflake 跑通或结果错误

评测在 **Snowflake** 上执行预测 SQL，将执行得到的 CSV 与 `gold/exec_result` 比对。以下为导致「跑不通」或「结果错」的五大类原因及对应写法对照。

### （一）方言不是 Snowflake（影响最大）

**现象**：预测中出现 Hive / Spark / BigQuery 语法，Snowflake 不支持或行为不一致。

| 预测中常见写法 | Snowflake 应写成 |
|----------------|------------------|
| `get_json_object(col,'$.path')` | `col:"path"::STRING` 或 `GET(col, path)` |
| `explode(from_json(col, 'array<struct<...>>'))` | `LATERAL FLATTEN(input => col)` |
| `LATERAL VIEW EXPLODE(...)` | `, LATERAL FLATTEN(input => ...) alias` |
| `` `列名` ``（反引号） | `"列名"`（双引号） |
| `RLIKE`、`REGEXP_EXTRACT` | `REGEXP_LIKE`、`REGEXP_SUBSTR` 等 |
| `to_date(..., 'yyyyMMdd')` | `TO_DATE(..., 'YYYYMMDD')` 或 `TRY_TO_DATE` |
| `collect_set()`、`array_join()`、`sort_array()` | `ARRAY_AGG(DISTINCT ...)`、`LISTAGG`、`ARRAY_SORT` 等 |
| `SIZE(array_intersect(...))`、`transform(...)` | `ARRAY_INTERSECTION`、`ARRAY_SIZE` 或 FLATTEN + 聚合 |
| 多段 `SELECT ... AS step_name`（“步骤”式） | 一条 SQL，用 `WITH cte AS (...) SELECT ...` |

**禁止使用的关键字/函数**：`get_json_object`、`explode`、`from_json`、`LATERAL VIEW`、`collect_set`、`array_join`、`RLIKE`。

---

### （二）库/表名不符合 Snowflake 实际

**规则**：评测按题目的 `db_id` 连库，表必须写成 **`"数据库"."Schema"."表"`** 三段式，且库名、表名须与真实环境一致。

| 错误示例 | 正确示例（按 db_id） |
|----------|----------------------|
| `PUBLICATIONS`、`PATENTS_PUBLICATIONS` | `"PATENTS"."PATENTS"."PUBLICATIONS"` |
| `PATENTS_GOOGLE_PUBLICATIONS` | `"PATENTS_GOOGLE"."PATENTS_GOOGLE"."PUBLICATIONS"` |
| sf_bq127 使用 PATENTS | 本题 db_id=**PATENTS_GOOGLE**，应使用其 PUBLICATIONS |
| sf_bq128 使用 PATENTS_USPTO_* | 本题 db_id=**PATENTSVIEW**，应使用 APPLICATION / PATENT / CPC_CURRENT / USPATENTCITATION 等 |
| sf_bq216 仅写 PUBLICATIONS | 还需 `"PATENTS_GOOGLE"."PATENTS_GOOGLE"."ABS_AND_EMB"` |
| sf_bq221 写 PATENTS_CPC_DEFINITION | 应为 `"PATENTS"."PATENTS"."CPC_DEFINITION"` |

**做法**：用 `spider2-snow.jsonl` 的 `instance_id → db_id` 确定当前题目所用库；按 db_id 维护「库.schema.表」列表，生成时只允许该库下的三段式表名。

---

### （三）业务逻辑/题意理解偏差

**现象**：语法、表名均正确，但筛选条件、时间窗口、统计口径与 gold 不一致，导致执行成功而结果判错。

| 题号 | 常见偏差 | Gold 要点 |
|------|----------|-----------|
| sf_bq033 | 用 publication_date、abstract 当标量 LIKE | 用 **filing_date** 20080101–20221231；抽象在 **LATERAL FLATTEN(abstract_localized)** 的 `value:"text"` 中 LIKE '%internet of things%'；输出需含「无申请记录的月份」且列与 exec_result 一致 |
| sf_bq209 | application_kind='U'、DATEADD(year,10,...) | utility 为 **'A'**；10 年用 **filing_date + 100000**（YYYYMMDD 风格） |
| sf_bq091 | 两条查询、RLIKE 匹配 CPC | 单条 SQL，**LATERAL FLATTEN(cpc/ipc)** 取 value:"code" LIKE 'A61%'，并展开 assignee_harmonized/assignee |
| sf_bq216 | 用 CPC 重叠当“技术相似” | 用 **embedding 向量相似度**，表 `ABS_AND_EMB.embedding_v1` |
| sf_bq127 | 用 PATENTS、未算 cited/citing families | 用 **PATENTS_GOOGLE**，算 families_cited / families_citing，输出列与 gold 一致 |
| sf_bq128 | 用 PATENTS 系表 | 用 **PATENTSVIEW** 的 APPLICATION / PATENT / CPC_CURRENT / USPATENTCITATION 等 |

**做法**：严格按题目与 external_knowledge 写 utility、application_kind、日期窗口、前后向引用定义；筛选、JOIN、输出列与 gold 及 `gold/exec_result/*.csv` 对齐。

---

### （四）输出列名、顺序与“空结果”约定

**现象**：评测对执行结果与 `gold/exec_result/<id>.csv` 做列向量比对；列名不参与比较，但列数、取值、以及「是否补 0」会影响通过。

**要点**：列名与顺序建议与对应 gold CSV 一致；是否忽略行序见 `spider2snow_eval.jsonl` 的 `ignore_order`；如 sf_bq033 必须包含「无申请记录的月份」并补齐 0。

---

### （五）多语句或非法结构

| 题号 | 现象 | 应改为 |
|------|------|--------|
| sf_bq099 | 多段 `SELECT ... AS step_name` 在 Snowflake 中非法 | 一条 SQL，用 `WITH cte1 AS (...), cte2 AS (...) SELECT ...` |
| sf_bq091 | 两条独立 SELECT 不能当一条执行；题意只需一个年份 | 单条查询，返回一列一行（年份） |

**原则**：每题只输出**一条**可单独执行的 Snowflake SQL，多步逻辑用 CTE。

---

## 二、CSV 结果层：与标答在结构、格式上的差异

除「答案数值对不对」以外，下列差异会影响**能否通过评测**或**与标答的可比性**。  
评测逻辑：`compare_pandas_table` 按**列向量**匹配（每条 gold 列需在 pred 中能找到一列取值集合相同）；`condition_cols` 指定参与比较的 gold 列索引；**列名不参与比较**。

### （一）列名不一致

**影响**：不改变当前评测判定（按列向量匹配），但不利于人工核对与规范统一。

| 题号 | 预测列名示例 | 标答列名示例 |
|------|--------------|--------------|
| sf_bq033 | year_month, us_iot_publication_count | PATENT_DATE_YEARMONTH, NUMBER_OF_PATENT_APPLICATIONS |
| sf_bq213 | ipc_4digit, count | ipc4, patent_count（或同类命名） |
| sf_bq221 | cpc_group, cpc_title_full, highest_ema | group_symbol, group_title, max_ema |
| sf_bq127 | earliest_publication_date, distinct_publication_numbers, distinct_country_codes, distinct_cpc_codes, distinct_ipc_codes, citing_families, cited_families | PUBLICATION_DATE, PUBLICATION_NUMBER, COUNTRY_CODE, CPC, IPC, CITATION, CITED_BY |
| sf_bq029 | interval_start, five_year_interval, patent_count, avg_inventors_per_patent | PERIOD, AVG_INVENTORS_PER_PATENT, TOTAL_PATENT_PUBLICATIONS |
| sf_bq223 | citing_assignee_organization | citing_assignee |
| sf_bq010 | product_name, unique_customers | gold_b：product_name, total_quantity（多标答时列名可能不同） |

---

### （二）日期 / 月份 / 区间格式不统一

**影响**：会导致该列在比较时判为不匹配（字符串不等）。

| 题号 | 含义 | 预测格式示例 | 标答格式示例 |
|------|------|--------------|--------------|
| sf_bq033 | 年月 | 2008-01, 2008-02（YYYY-MM） | 200801, 200802（YYYYMM） |
| sf_bq127 | 首次公开日 | 2015-01-27（日期） | 20150101（YYYYMMDD） |
| sf_bq029 | 五年区间 | 最后一行 2020-2024 | 最后一行 2020-2020（区间右端约定不同） |

---

### （三）列数不一致

| 题号 | 预测列数 | 标答列数 | 说明 |
|------|----------|----------|------|
| sf_bq091 | 3：assignee, year, patent_count | 1：year | 题意仅需「哪一年」，预测多出 assignee、patent_count |
| sf_bq216 | 2：publication_number, overlap_count | 1：publication_number | 预测多一列；condition_cols [0] 只比第一列，多列不必然判错，但 schema 与标答不一致 |
| sf_bq029 | 4 | 3 | 预测多 interval_start |
| sf_bq010 | 2 | gold_a 为 1 列、gold_b 为 2 列 | 多标答时，预测可能只与其中一套列数一致 |

---

### （四）字符串风格差异（大小写、名称形态）

**影响**：按字符串相等比较，不一致即不匹配。

- **sf_bq223**：  
  - 预测：citing_assignee_organization，取值如 `"Visteon Global Technologies, Inc."`（大小写、完整机构名）  
  - 标答：citing_assignee，取值如 `fuji electric co ltd`（小写、较短名称）

---

### （五）多标准答案（_a / _b / _c …）

如 **sf_bq010**：gold 有 _a（1 列）、_b（2 列）等多套标答，列名与列数可能不同。评测会与每一套比较，**命中任一套即判对**。若希望与标答在结构、格式上完全一致，需按某一套标答的列名、列数、格式对齐。

---

### （六）CSV 层问题与评测影响一览

| 类型 | 是否影响当前评测判定 | 说明 |
|------|----------------------|------|
| 列名不同 | 否 | 按列向量匹配，列名不参与比较；影响可读性与规范。 |
| 日期/月份/区间格式不同 | **是** | 字符串不等会直接导致该列不匹配。 |
| 列数不同 | 视 condition_cols 与内容而定 | 多列时，参与比较的 gold 列在 pred 中有等值列即可；少列易判错。 |
| 字符串风格不同（大小写、机构名形态等） | **是** | 按字符串相等比较。 |
| 语义/题意不一致（如 citing vs cited 定义反了） | **是** | 结果集错误，不仅格式问题。 |

---

## 三、按题目速查（SQL + CSV 合并）

下表覆盖「gold/sql 与 infini_output_sql 交集 12 题」及「在 infini_output_csv 中有结果且与 gold 可比的题目」的主要问题类型与优先级。

| 题号 | db_id | SQL 层主要问题 | CSV 层主要问题 | 优先级 |
|------|--------|----------------|----------------|--------|
| sf_bq033 | PATENTS | 表/库名、FLATTEN 抽象、月份序列、输出列 | 列名、年月格式 YYYY-MM vs YYYYMM | 高 |
| sf_bq091 | PATENTS | Hive/BQ 全句、表名、需单条 Snowflake + FLATTEN | 列数：3 列 vs 1 列（year） | 高 |
| sf_bq099 | PATENTS | “SELECT…AS 步骤”非法、explode/from_json | — | 高 |
| sf_bq127 | PATENTS_GOOGLE | 库应为 PATENTS_GOOGLE、explode/collect_set 等 | 列名、日期格式、CITATION/CITED_BY 语义 | 高 |
| sf_bq128 | PATENTSVIEW | 库应为 PATENTSVIEW、表结构完全不同 | — | 高 |
| sf_bq209 | PATENTS | application_kind 'U'→'A'、10 年窗口写法 | — | 中 |
| sf_bq210 | PATENTS | 核对 claims 不含 “claim” 的字段与条件 | — | 中 |
| sf_bq213 | PATENTS | explode/from_json→FLATTEN、表名 | 列名 ipc_4digit/count vs ipc4/patent_count | 高 |
| sf_bq216 | PATENTS_GOOGLE | 表名、相似度须用 embedding | 列数：2 列 vs 1 列 | 高 |
| sf_bq221 | PATENTS | get_json_object、表名、需 CPC_DEFINITION | 列名 cpc_group/group_symbol 等 | 高 |
| sf_bq222 | PATENTS | 若仍为 Hive/Spark 或错误库，同 sf_bq221 | — | 中 |
| sf_bq223 | PATENTS | 库表、JSON 展开方式按 gold | 列名、机构名大小写/形态 | 中 |
| sf_bq010 | GA360 | — | 列名 unique_customers vs total_quantity；多标答 | 中 |
| sf_bq029 | PATENTS | — | 列名、列数(4 vs 3)、区间格式 2020-2024 vs 2020-2020 | 中 |

---

## 四、统一改进清单（可执行）

### （一）SQL 生成侧

1. **Snowflake 唯一**：在 prompt/约束中写明「只生成可在 Snowflake 中直接执行的 SQL」；做本地方言过滤（出现 get_json_object / explode / LATERAL VIEW / RLIKE 等即判需重写）。
2. **按 db_id 绑定表**：为每个 db_id 维护 Snowflake 的 database.schema.table 列表；生成时只使用该库下的三段式表名。
3. **以 Gold 为参照**：表引用、LATERAL FLATTEN、日期与枚举条件、输出列名向 gold/sql 与 `gold/exec_result/*.csv` 对齐。
4. **用足 external_knowledge**：对 sf_bq213/221/216 等题，将对应 md 要点（embedding、EMA、CPC first+level5 等）注入生成上下文。
5. **单条可执行**：每题仅输出一条 Snowflake SQL，多步用 WITH；不输出多条独立 SELECT。

### （二）结果 CSV 侧（生成或后处理）

1. **列名与列数**：尽量与目标 gold 标答的列名、列数一致（可参考 `gold/exec_result` 与题目说明）。
2. **日期/月份格式**：与 gold 一致，如 YYYYMM、YYYYMMDD，避免 YYYY-MM 等混用。
3. **区间与边界**：如五年区间、最后一年区间，与 gold 的约定一致（如 2020-2020 vs 2020-2024）。
4. **字符串规范化**：机构名、代码等与 gold 采用相同规则（如统一小写、统一缩写程度）。

### （三）本地可做的校验

- **方言过滤**：生成的 SQL 中若仍含 get_json_object、explode、LATERAL VIEW、RLIKE 等，直接判为需重写。
- **库表校验**：按 db_id 检查是否仅使用该库下的表，且为「库.schema.表」形式。
- **输出列校验**：执行后 CSV 的列数、关键列取值格式与对应 gold CSV 抽样对比。

---

## 五、附录：评测逻辑与路径速查

- **SQL 模式**：`python evaluate.py --mode sql --result_dir <预测SQL目录>`  
  会执行预测 SQL、将结果写入 `<result_dir>_csv`，再与 `gold/exec_result` 比对。
- **CSV 模式**：`python evaluate.py --mode exec_result --result_dir <预测CSV目录>`  
  直接拿预测 CSV 与 `gold/exec_result` 比对，不执行 SQL。
- **参与比较的列**：由 `gold/spider2snow_eval.jsonl` 中该题的 `condition_cols` 决定；`ignore_order` 为 true 时，行序不参与比较。
- **多标答**：若某题存在多个 gold 文件（如 sf_bq010_a、sf_bq010_b），命中其中任一个即判对。

---

*详细题例与逐句对照见 `gold_vs_infini_对比分析.md`；CSV 结构说明见 `infini_csv_vs_gold_对比说明.md`。*
