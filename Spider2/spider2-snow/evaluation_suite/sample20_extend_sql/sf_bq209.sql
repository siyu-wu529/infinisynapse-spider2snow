-- sf_bq209: 计算2010年获得授权的实用新型专利中恰好有1个前向引用的专利数量
-- 数据源: PATENTS_PATENTS 数据库
-- 前向引用定义: 在专利申请日期后10年窗口期内引用该专利的不同申请号数量

WITH utility_patents_2010 AS (
    -- 筛选2010年获得授权的实用新型专利
    SELECT 
        "publication_number",
        "application_number",
        "filing_date",
        "grant_date"
    FROM "PUBLICATIONS" 
    WHERE "grant_date" BETWEEN 20100101 AND 20101231
    AND "application_kind" = 'U'  -- 实用新型专利
),
citing_patents AS (
    -- 获取所有包含引用的专利
    SELECT 
        "publication_number" as citing_patent,
        "citation",
        "filing_date" as citing_filing_date
    FROM "PUBLICATIONS" 
    WHERE "citation" IS NOT NULL 
    AND "citation" != '[]'  -- 排除空引用
),
forward_citation_stats AS (
    -- 计算每个2010年实用新型专利的前向引用数量
    SELECT 
        up."publication_number",
        up."application_number",
        up."filing_date",
        up."grant_date",
        COUNT(DISTINCT cp.citing_patent) as forward_citation_count
    FROM utility_patents_2010 up
    JOIN citing_patents cp
    ON cp."citation" LIKE '%' || up."publication_number" || '%'  -- 查找引用关系
    AND cp.citing_filing_date BETWEEN up."filing_date" AND up."filing_date" + 100000  -- 10年窗口期
    AND cp.citing_patent != up."publication_number"  -- 排除自引用
    GROUP BY up."publication_number", up."application_number", up."filing_date", up."grant_date"
)
-- 统计恰好有1个前向引用的专利数量
SELECT COUNT(*) as patents_with_exactly_one_forward_citation
FROM forward_citation_stats
WHERE forward_citation_count = 1;

-- 结果: 3个专利恰好有1个前向引用
-- 详细专利信息:
-- 1. CN-201427255-Y (申请号: CN-200920091233-U, 申请日期: 20090701, 授权日期: 20100324)
-- 2. CN-201620562-U (申请号: CN-201020002064-U, 申请日期: 20100111, 授权日期: 20101103)
-- 3. CN-201400470-Y (申请号: CN-200920096412-U, 申请日期: 20090421, 授权日期: 20100210)