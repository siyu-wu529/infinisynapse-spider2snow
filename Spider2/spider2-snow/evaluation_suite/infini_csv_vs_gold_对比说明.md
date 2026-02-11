# infini_output_csv 与 gold 标答 CSV 对比说明

> 说明：除「答案数值/结果对不对」以外，从**列名、列数、日期与格式、列顺序与语义**等结构层面，对比 `infini_output_csv` 与 `gold/exec_result` 的差异。  
> 评测逻辑见 `evaluate.py`：`compare_pandas_table` 按**列向量**匹配（每条 gold 列需在 pred 中能找到一列取值集合相同），`condition_cols` 指定参与比较的 gold 列索引，**列名不参与比较**。

---

## 1. 列名不一致（与 gold 标答不一致）

以下题目中，infini 的列名与 gold 不同，**不影响当前评测是否判对**，但不利于人工核对和统一规范：

| 题号 | infini 列名示例 | gold 列名示例 |
|------|-----------------|----------------|
| sf_bq033 | `year_month`, `us_iot_publication_count` | `PATENT_DATE_YEARMONTH`, `NUMBER_OF_PATENT_APPLICATIONS` |
| sf_bq213 | `ipc_4digit`, `count` | `ipc4`, `patent_count`（或类似） |
| sf_bq221 | `cpc_group`, `cpc_title_full`, `highest_ema` | `group_symbol`, `group_title`, `max_ema` |
| sf_bq127 | `earliest_publication_date`, `distinct_publication_numbers`, `distinct_country_codes`, `distinct_cpc_codes`, `distinct_ipc_codes`, `citing_families`, `cited_families` | `PUBLICATION_DATE`, `PUBLICATION_NUMBER`, `COUNTRY_CODE`, `CPC`, `IPC`, `CITATION`, `CITED_BY` |
| sf_bq029 | `interval_start`, `five_year_interval`, `patent_count`, `avg_inventors_per_patent` | `PERIOD`, `AVG_INVENTORS_PER_PATENT`, `TOTAL_PATENT_PUBLICATIONS` |
| sf_bq223 | `citing_assignee_organization` | `citing_assignee` |
| sf_bq010 | `product_name`, `unique_customers` | gold_b 为 `product_name`, `total_quantity`（多标准答案时列名也可能不同） |

**建议**：若希望与标答、评测脚本或下游流程一致，生成结果时尽量采用 gold 中的列名（可参考 `gold/exec_result` 与题目说明）。

---

## 2. 日期 / 月份 / 区间格式不统一

同一含义的“月”“日”“区间”，在 infini 与 gold 中用不同字符串表示，会直接导致列向量无法匹配（字符串不等）：

| 题号 | 含义 | infini 格式示例 | gold 格式示例 |
|------|------|------------------|----------------|
| **sf_bq033** | 年月 | `2008-01`, `2008-02`（YYYY-MM） | `200801`, `200802`（YYYYMM） |
| **sf_bq127** | 首次公开日 | `2015-01-27`（日期） | `20150101`（YYYYMMDD 整数或字符串） |
| **sf_bq029** | 五年区间 | 最后一行为 `2020-2024` | 最后一行为 `2020-2020`（区间右端约定不同） |

这类差异属于**格式规范**问题，不是“数算错”，但会直接导致该列在现有比较逻辑下被判为不匹配。

---

## 3. 列数不一致（多列 / 少列）

| 题号 | infini 列数 | gold 列数 | 说明 |
|------|-------------|-----------|------|
| **sf_bq091** | 3：`assignee`, `year`, `patent_count` | 1：`year` | 题意只要「哪一年」，gold 仅一列；infini 多出 assignee、patent_count，列数、语义都与标答不同。 |
| **sf_bq216** | 2：`publication_number`, `overlap_count` | 1：`publication_number` | gold 只要求 5 个 publication_number；infini 多一列 overlap_count。当前评测用 condition_cols [0]，只比 publication_number 一列，多列不必然导致判错，但**输出形状与标答不一致**。 |
| **sf_bq029** | 4 | 3 | infini 多一列 `interval_start`，gold 无此列。 |
| **sf_bq010** | 2 | gold_a 为 1 列、gold_b 为 2 列 | 多标准答案时，infini 的列数可能只与其中一种标答一致。 |

列数不同时，只要「参与比较的 gold 列」能在 pred 中找到取值集合相同的列，仍可能判对；但**输出 schema 与标答不一致**，不利于统一解析和报告。

---

## 4. 列顺序与语义对应

- 评测按「列向量集合」匹配，不要求列顺序一致，也不要求列名一致。  
- 若存在 **condition_cols**，则只拿 gold 的指定列参与比较；pred 中由**哪一列**对应这条 gold 列，是由“取值集合相同”隐式决定的，因此列顺序不会单独导致误判，只要存在一列取值一致即可。
- 需注意的是：**语义要对齐**。例如 sf_bq127 中 gold 的 `CITATION` / `CITED_BY` 与 infini 的 `citing_families` / `cited_families` 若在“谁算 citing、谁算 cited”上定义相反，会导致逻辑错误，从而结果对不上，这类属于题意/语义层面，而不是单纯的“格式”或“列名”问题。

---

## 5. 字符串风格差异（大小写、名称形态）

- **sf_bq223**：  
  - infini：`citing_assignee_organization`，取值如 `"Visteon Global Technologies, Inc."`（保留大小写、较完整机构名）。  
  - gold：`citing_assignee`，取值如 `fuji electric co ltd`（小写、较短名称）。  
  即使列语义相同，**字符串不一致**会直接导致该列在比较时不匹配，属于「格式/规范化」问题，而不是纯数字差异。

---

## 6. 多标准答案（gold 多个 _a / _b / _c …）时的注意点

- 如 **sf_bq010**：gold 有 `_a`（1 列）、`_b`（2 列）等多套标答，列名与列数都可能不同。  
- 评测会与**每一套** gold 做比较，只要命中其中一套即判对该题。  
- 从「和标答结构一致」角度，infini 若与某一套标答的列名、列数、格式一致，会更利于人工核对和复用同一套下游逻辑。

---

## 7. 小结：除“答案数字”外的几类问题

| 类型 | 是否影响当前评测判定 | 说明 |
|------|----------------------|------|
| **列名不同** | 否（按列向量匹配） | 与 gold 不一致，影响可读性和规范统一。 |
| **日期/月份/区间格式不同** | **是** | 如 2008-01 vs 200801、2015-01-27 vs 20150101，会直接导致该列不匹配。 |
| **列数不同** | 视 condition_cols 与内容而定 | 多列时，只要参与比较的 gold 列在 pred 中有等值列即可判对；少列则可能缺“某条 gold 列”的对应，易判错。 |
| **字符串风格不同**（大小写、机构名形态等） | **是** | 按字符串相等比较，不一致即不匹配。 |
| **语义/题意不一致**（如 citing vs cited 定义反了） | **是** | 会导致结果集本身错误，不仅格式问题。 |

若希望 infini_output_csv 在「答案正确」之外，还与标答在**结构、格式上一致**，建议在生成或后处理时：

1. 尽量采用 gold 的列名与列数；  
2. 日期/月份采用与 gold 相同格式（如 YYYYMM、YYYYMMDD）；  
3. 对机构名、代码等字符串做与 gold 相同的规范化（如统一小写、统一缩写程度等）。

---

*评测脚本见 `evaluate.py`，gold 标答目录为 `gold/exec_result`，每题参与比较的列由 `gold/spider2snow_eval.jsonl` 中的 `condition_cols` 决定。*
