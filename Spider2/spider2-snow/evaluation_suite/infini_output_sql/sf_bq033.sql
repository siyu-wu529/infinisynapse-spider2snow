-- 统计2008年至2022年每月美国与物联网相关的出版物数量
-- 包括没有申请记录的月份

WITH months AS (
    -- 生成2008年1月至2022年12月的所有月份
    SELECT 
        DATEADD(month, seq4(), '2008-01-01')::DATE AS month_start
    FROM 
        TABLE(GENERATOR(ROWCOUNT => 180))  -- 180个月 = 15年 * 12个月
    WHERE 
        month_start <= '2022-12-01'
),
iot_publications AS (
    -- 筛选美国出版物，摘要中包含'internet of things'
    SELECT 
        TO_DATE(CAST("publication_date" AS VARCHAR), 'YYYYMMDD') AS pub_date,
        "publication_number",
        "country_code"
    FROM 
        PUBLICATIONS
    WHERE 
        "country_code" = 'US'
        AND "abstract_localized" IS NOT NULL
        AND LOWER("abstract_localized"::VARCHAR) LIKE '%internet of things%'
        AND "publication_date" BETWEEN 20080101 AND 20221231
),
monthly_counts AS (
    -- 按月统计数量
    SELECT 
        DATE_TRUNC('month', pub_date)::DATE AS month_start,
        COUNT(*) AS publication_count
    FROM 
        iot_publications
    GROUP BY 
        DATE_TRUNC('month', pub_date)
)
-- 左连接，确保所有月份都出现，包括零记录的月份
SELECT 
    TO_CHAR(m.month_start, 'YYYY-MM') AS year_month,
    COALESCE(mc.publication_count, 0) AS us_iot_publication_count
FROM 
    months m
LEFT JOIN 
    monthly_counts mc ON m.month_start = mc.month_start
ORDER BY 
    m.month_start;