# Gold SQL vs Infinisynapse_sql 处理问题逻辑对比

> 对比范围：**gold/sql** 与 **infinisynapse_sql** 的交集题目，共 **9 题**。  
> 关注点：你在**处理问题时的逻辑**与 Gold 的差异（题意理解、统计口径、库表用法、输出约定等）。

---

## 交集题目列表

| 题号 | 说明（从 gold 题意归纳） |
|------|--------------------------|
| sf_bq028 | NPM 每个 package 取「最新 release 版本」且关联 GITHUB project，按 stars 取代表，再按 github_stars 取 top8 |
| sf_bq167 | Kaggle 论坛：找出「互相投票」的一对用户中，收到票数最多的那一对（1 行），输出 Giver/Receiver 名与收到/回投的票数 |
| sf_bq213 | PATENTS：2022-06~08 美国 B2 专利中，按「每个专利的主 IPC 前 4 位」统计，输出**最常见的 1 个** IPC4 及数量 |
| sf_bq216 | PATENTS_GOOGLE：与 US-9741766-B2 **技术最相似**的 top5 专利（**必须用 embedding 向量相似度**，同一年份） |
| sf_bq263 | THELOOK：Sleep & Lounge 类目、2023 年、已完成的订单，按月汇总销售/成本/利润与 profit_to_cost_ratio |
| sf_bq444 | Uniswap V3 某池：**MINT 前 5 条 + BURN 前 5 条**事件（共 10 行），按 event_type 分别取前 5 |
| sf_local010 | 航班：城市对平均距离的直方图，取「group_count 最小」的 distance_range 的 **group_count**（1 行） |
| sf_local022 | IPL：单场得分≥100 且**所在队输球**的球员，输出 **distinct 球员名 |
| sf_local157 | 比特币：2021-08-01~10 日度 volume 环比（%），LAG 用 IGNORE NULLS，0 视作 NULL 不参与前后期 |

---

## 一、你侧在处理问题逻辑上的共性问题

1. **库/表名未按 Snowflake 三段式**  
   多处只用 `"PUBLICATIONS"`、`"FORUMMESSAGEVOTES"`、`"LOGS"` 等，未写 `"库"."Schema"."表"`，在按 db_id 连库的评测里会报错或查错库。

2. **题意中的“定义”与 Gold 不一致**  
   如：最新版本（是否只看 release）、技术相似（embedding 还是 CPC）、最常见 IPC（是否按专利内主 IPC 优先）、MINT/BURN 各前 5 还是全局前 5 等。

3. **统计口径与 Gold 不同**  
   如：按消息条数还是按投票条数、是否区分 first IPC、LAG 是否 IGNORE NULLS、profit 分母为 0 时取 NULL 还是 0。

4. **输出列名、列数、顺序与 gold/exec_result 不一致**  
   评测对 exec_result 做列级比对，多列、少列、列名不同都会导致不通过。

下面按题写**你侧逻辑上的具体问题**。

---

## 二、按题对比：你侧逻辑问题摘要

### sf_bq028（NPM top 8 by github stars）

| 维度 | Gold 的逻辑 | 你侧的问题 |
|------|-------------|------------|
| 库表 | `"DEPS_DEV_V1"."DEPS_DEV_V1"."PACKAGEVERSIONS"` 等三段式 | 只用 `"PACKAGEVERSIONS"` 等，无库.schema |
| 「最新版本」 | 仅考虑 **IsRelease = true** 的版本，按 UpstreamPublishedAt/SnapshotAt 取每个 package 最新一条 | 按 UpstreamPublishedAt 取最新，**未过滤 IsRelease**，把非 release 版本也算进“最新” |
| 「每个 package 的 stars」 | 先定该 package 的 **latest release**，再通过 PACKAGEVERSIONTOPROJECT 连到 PROJECTS，**在同一 package 的多个 project 里按 stars 取一条**（ROW_NUMBER），再 rn=1 | 用 **MAX(StarsCount)** 对“该 package 任意版本关联的 project”取最大 stars，没有“先定 latest release 再在该版本关联的 project 里选”的步骤，统计口径不同 |
| 输出 | package_name, **version**, github_stars；按 github_stars DESC, package_name 取 8 条 | 用了 latest_version、max_stars，列名与 gold 不一致，且 version 的选取逻辑不同 |

**结论**：除了表名，核心是「最新版本 = release 且按发布时间取」以及「stars = 该 package 的 latest release 所关联 project 的代表 stars」，你侧未按这两点做。

---

### sf_bq167（Kaggle 互相投票最多的一对）

| 维度 | Gold 的逻辑 | 你侧的问题 |
|------|-------------|------------|
| 库表 | `"META_KAGGLE"."META_KAGGLE"."FORUMMESSAGEVOTES"` 等 | 只用 `"FORUMMESSAGEVOTES"`、`"USERS"` |
| 统计粒度 | **COUNT(DISTINCT "ForumMessageId")**：按“被投票的消息”去重 | 用 **COUNT(DISTINCT "Id")**：若 Id 是 vote 的 id，与“消息数”不一定一致，统计口径可能不同 |
| 过滤 | FromUserId/ToUserId 非空且不等 | 未显式写“不等”，若数据有自投则可能多算 |
| 输出列名 | GiverUserName, ReceiverUserName, **ReceivedUpvotes**, **ReturnedUpvotes** | 用了 giver_username, receiver_username, distinct_upvotes_given, distinct_upvotes_received_back，列名与 gold/exec_result 不一致 |
| 用户显示名 | **COALESCE(UserName, DisplayName)** | 只取 UserName，与 gold 约定不一致 |

**结论**：表名 + 统计用 ForumMessageId 还是 Id + 输出列名与显示名约定，都需与 gold 对齐。

---

### sf_bq213（美国 B2 最常见 4 位 IPC）

| 维度 | Gold 的逻辑 | 你侧的问题 |
|------|-------------|------------|
| 库表 | `"PATENTS"."PATENTS"."PUBLICATIONS"` | 只用 `"PUBLICATIONS"` |
| 「每个专利的 IPC4」 | 用 **LATERAL FLATTEN(ipc)**，取 `value:"code"` 前 4 位，并看 **value:"first"**；在同一专利内按 **has_first DESC, cnt_all DESC, ipc4 ASC** 取**一个**“主 IPC4” | 你侧未用 **first**，直接按 four_digit_code 聚合并 **COUNT(*)**，相当于“该专利下所有出现过的 IPC4 都算”，没有“每专利只贡献一个主 IPC4” |
| 题目要求 | 在 above 基础上，按 ipc4 汇总专利数，取 **最常见的 1 个** IPC4 → **LIMIT 1**，输出 most_common_ipc4, num_publications | 你用了 **LIMIT 10**，且列名 ipc_4_digit, patent_count，输出行数与列名都与 gold 不一致 |
| 其它 | ipc 已是 VARIANT/OBJECT，Gold 直接 FLATTEN，无需 PARSE_JSON | 你用了 PARSE_JSON，在 Snowflake 里若已是 OBJECT 可能多余或报错，依实际类型而定 |

**结论**：必须实现“每专利只计一个主 IPC4（first 优先）”，再按该 IPC4 聚合并只取 top1，且列名/行数与 exec_result 一致。

---

### sf_bq216（与 US-9741766-B2 技术最相似 top5）

| 维度 | Gold 的逻辑 | 你侧的问题 |
|------|-------------|------------|
| 题意 | **技术相似 = embedding 向量相似度**（Cosine），用 `ABS_AND_EMB.embedding_v1` | 你用 **CPC 重叠**（target 的 cpc_code IN candidate 的 cpc_code）当“相似”，与题目要求的“技术相似”完全不同 |
| 库表 | `"PATENTS_GOOGLE"."PATENTS_GOOGLE"."ABS_AND_EMB"` 与 PUBLICATIONS | 只用 `"ABS_AND_EMB"`、`"PUBLICATIONS"`，无库.schema |
| 实现 | 把 target 与 candidate 的 embedding_v1 做 **LATERAL FLATTEN**，按 index 对齐，**ORDER BY SUM(c.value * t.value) DESC**（等价于已归一化向量的余弦），LIMIT 5 | 无 embedding，仅 IN (SELECT cpc_code FROM target_cpc) |

**结论**：这是**题意理解**上的根本偏差：必须用 embedding 相似度，不能用 CPC 重叠。同时需补全库.schema。

---

### sf_bq263（THELOOK Sleep & Lounge 按月汇总）

| 维度 | Gold 的逻辑 | 你侧的问题 |
|------|-------------|------------|
| 库表 | 已用 `"THELOOK_ECOMMERCE"."THELOOK_ECOMMERCE"."*"` | 你同样用了三段式，这点一致 |
| 时间 | `TO_TIMESTAMP_NTZ("O"."created_at" / 1000000) >= '2023-01-01' AND < '2024-01-01'` | 你用 `BETWEEN '2023-01-01' AND '2023-12-31'`，与 gold 等价，可接受 |
| 完成订单 | 只限制 **"O"."status" = 'Complete'**（订单维度） | 你多了 **"oi"."status" = 'Complete'**；若 ORDER_ITEMS 没有 status 会报错，若有且含义不同会改变结果 |
| profit_to_cost_ratio | **CASE WHEN SUM("P"."cost") = 0 THEN NULL ELSE ...** | 你用 **ELSE 0**，与 gold 的“分母为 0 则 NULL”不一致，会影响与 exec_result 的比对 |
| 输出 | 无 LIMIT；ORDER BY 1 | 你无 LIMIT，ORDER BY "month"，顺序需与 gold 一致（通常即按月份） |

**结论**：主要逻辑差异在「只按订单 status 过滤」以及「cost=0 时 ratio 为 NULL 而非 0」；再核对 ORDER_ITEMS 是否有 status 字段。

---

### sf_bq444（Uniswap V3 MINT/BURN 各前 5 条）

| 维度 | Gold 的逻辑 | 你侧的问题 |
|------|-------------|------------|
| 库表 | 仅用 **"CRYPTO"."CRYPTO_ETHEREUM"."LOGS"**，无 BLOCKS | 你用 `"LOGS"` 与 **"BLOCKS"** JOIN 取时间，表名无库.schema，且多依赖了 BLOCKS |
| 题意 | **MINT 前 5 条 + BURN 前 5 条** → 共 10 行，按 event_type 分别取前 5 | 你 **ORDER BY b."timestamp" ASC LIMIT 5**，只取**全局**前 5 条，没有“每种 event_type 各 5 条” |
| 事件类型 | 用 **"topics"[0]::STRING** 判 MINT / BURN，且只保留这两种 | 用 **ARRAY_CONTAINS** 判 topics，没有限定“仅 topics[0]”；且 MINT/BURN 的判定顺序与 gold 的 CASE 顺序可能不一致 |
| 时间戳 | 用 **LOGS 的 block_timestamp**，再 `TO_TIMESTAMP_NTZ("block_timestamp" / 1000000)` | 你用 BLOCKS.timestamp，若与 LOGS.block_timestamp 单位/含义不同，结果会不同 |
| 排序 | 先按 event_type 分区 ROW_NUMBER，再按 block_timestamp, block_number, log_index 等排序 | 你按 b."timestamp" 全局排序，无分区 |

**结论**：题意是“**按 MINT/BURN 各取前 5**”，不是“全局前 5”；且应用 LOGS + topics[0]，并保证库.schema 与 gold 一致。

---

### sf_local010（航班距离直方图，取 group_count 最小的一档）

| 维度 | Gold 的逻辑 | 你侧的问题 |
|------|-------------|------------|
| 库表 | **AIRLINES.AIRLINES.FLIGHTS**、**AIRPORTS_DATA** | 只用 `"FLIGHTS"`、`"AIRPORTS_DATA"` |
| 城市对 | 按 **(from_city, to_city)** 保留**方向**：A→B 与 B→A 是两条 | 你把 (from, to) 归一化成 (city1, city2)（按字典序），**A→B 和 B→A 合并成一条**，直方图分布会变 |
| 距离区间 | **FLOOR(average_distance_km / 1000) * 1000** 作为数值型 distance_range，再按 group_count 排序 **LIMIT 1**，只输出 **"group_count"** | 你用字符串区间 '0-1000','1000-2000'…，且 **ORDER BY pair_count ASC** 后取的是 **整个 range_counts**，没有 LIMIT 1；输出列是 distance_range + pair_count，而 gold 只要求 **group_count** 一列（即“最小那一档的 group_count”） |
| 坐标/城市 | Gold 用 PARSE_JSON(city):"en"、SUBSTR/POSITION 解析 coordinates | 你用 JSON_EXTRACT_PATH_TEXT、SPLIT_PART(REPLACE...)，需保证与 Snowflake 下实际类型一致（若 city 已是 OBJECT 可能要用 :"en"） |

**结论**：是否对城市对做 (c1,c2) 归一化、distance_range 的取值方式、以及“只输出 group_count 且只一行”的约定，都需与 gold/exec_result 一致。

---

### sf_local022（IPL 得分≥100 且所在队输球的球员）

| 维度 | Gold 的逻辑 | 你侧的问题 |
|------|-------------|------------|
| 库表 | **IPL.IPL.*** | 你未写库.schema |
| 输出 | **SELECT DISTINCT "P"."player_name"**：只一列，球员名去重 | 你输出 player_name, match_id, player_team, winning_team, total_runs 等多列，且未做“按球员名去重” |
| 「所在队输球」 | 通过 **PLAYER_MATCH**：**PM.team_id IN (M.team_1, M.team_2) AND PM.team_id != M.match_winner** | 你用 **bbb.team_batting != m.match_winner**，语义类似“该局 batting 方不是胜队”；若题目强调“该球员**所在队**”需用 PLAYER_MATCH 的 team_id，与 gold 保持一致更稳 |
| 聚合 | 先按 match, striker 汇总 runs，再 join 过滤 | 你先按 player, match 等 GROUP BY 再 HAVING，等价思路可行，但输出必须是“distinct player_name”且列数=1 |

**结论**：输出应为 **一列、distinct player_name**；“所在队输球”建议按 gold 用 PLAYER_MATCH + team_1/team_2/match_winner。

---

### sf_local157（比特币日度 volume 环比）

| 维度 | Gold 的逻辑 | 你侧的问题 |
|------|-------------|------------|
| 库表 | `"BANK_SALES_TRADING"."BANK_SALES_TRADING"."BITCOIN_PRICES"` | 只用 `"BITCOIN_PRICES"` |
| 日期 | **TO_DATE("market_date", 'DD-MM-YYYY') BETWEEN '2021-08-01' AND '2021-08-10'** | 你用 **"market_date" BETWEEN '01-08-2021' AND '10-08-2021'**：若 market_date 是字符串 'dd-mm-yyyy'，与 gold 的日期区间一致，但若存的是其它格式，需要先 TO_DATE 再比较 |
| LAG | **LAG(IFF("volume_cleaned" = 0, NULL, "volume_cleaned"), 1) IGNORE NULLS**：把 0 当作“缺失”跳过，前一个非空值为前一日的有效 volume | 你用 **LAG("converted_volume")** 无 IGNORE NULLS，且 **WHEN prev_volume = 0 OR prev_volume IS NULL THEN NULL** 在最终公式里才处理；**前一日的“0”是否跳过**会改变环比序列，与 gold 不一致 |
| 输出 | 仅 **ticker, market_date, volume_percentage_change** 三列 | 你多了 converted_volume, prev_volume，列数与列名都与 gold 不一致 |

**结论**：LAG 的 **IGNORE NULLS** 与“0 视为 NULL”的约定会影响结果；输出列需与 gold/exec_result 一致（三列、列名一致）。

---

## 三、你侧「处理问题逻辑」上的归纳

1. **库表命名**  
   未按题目 db_id 使用 Snowflake 的「库.Schema.表」三段式，导致评测环境里表找不到或连错库。

2. **题意中的“定义”未对齐**  
   - 最新版本：是否只算 release、按什么字段排序取最新  
   - 技术相似：必须用 embedding，不能用 CPC 或其它  
   - 最常见 IPC：是否“每专利只计一个主 IPC（first 优先）”  
   - MINT/BURN：是“每种各前 5”还是“全局前 5”  
   - 城市对：是否保留方向 (from, to) 还是归一化 (c1, c2)

3. **统计口径与 Gold 不一致**  
   - 按消息数 vs 按投票数（ForumMessageId vs Id）  
   - LAG 是否 IGNORE NULLS、0 是否视作 NULL  
   - 比值类指标在分母为 0 时是 NULL 还是 0

4. **输出未按 gold/exec_result 约定**  
   - 列名、列数、顺序不一致  
   - 多题多做了“多列、多行”（如 sf_local022 多列、sf_bq213 取 10 行、sf_bq444 只取 5 行、sf_local010 未只取 1 行且列名不对）

建议在生成 infinisynapse_sql 时：  
- 按 **instance_id → db_id** 强制使用该库的三段式表名；  
- 对“最新/相似/最常见/各前 K/去重列”等题意，在 prompt 或校验里明确与 gold 一致的定义；  
- 生成后做一次「输出列名、行数、关键表达式」与 gold/exec_result 的对照检查。
