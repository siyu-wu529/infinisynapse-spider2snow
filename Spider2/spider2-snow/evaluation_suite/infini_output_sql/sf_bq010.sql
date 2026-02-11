-- 查询在2017年7月购买了'Youtube Men’s Vintage Henley'的客户中，除了该产品本身之外，最畅销的产品
-- 注意：需要将以下查询中的表名替换为2017年7月所有31天的表（GA360_GA_SESSIONS_20170701 到 GA360_GA_SESSIONS_20170731）
-- 每个子查询结构相同，只需复制并修改表名

SELECT product_name, COUNT(DISTINCT fullVisitorId) AS unique_customers
FROM (
    -- 2017-07-01
    SELECT sessions.fullVisitorId, product.v2ProductName AS product_name
    FROM (SELECT DISTINCT fullVisitorId FROM `GA360_GA_SESSIONS_20170701` WHERE hits LIKE '%YouTube Men%' AND hits LIKE '%Vintage Henley%') AS target
    JOIN `GA360_GA_SESSIONS_20170701` AS sessions ON target.fullVisitorId = sessions.fullVisitorId
    LATERAL VIEW EXPLODE(FROM_JSON(sessions.hits, 'array<struct<product:array<struct<v2ProductName:string>>>>')) AS hit
    LATERAL VIEW EXPLODE(hit.product) AS product
    WHERE product.v2ProductName != 'YouTube Men’s Vintage Henley'
    UNION ALL
    -- 2017-07-02
    SELECT sessions.fullVisitorId, product.v2ProductName AS product_name
    FROM (SELECT DISTINCT fullVisitorId FROM `GA360_GA_SESSIONS_20170702` WHERE hits LIKE '%YouTube Men%' AND hits LIKE '%Vintage Henley%') AS target
    JOIN `GA360_GA_SESSIONS_20170702` AS sessions ON target.fullVisitorId = sessions.fullVisitorId
    LATERAL VIEW EXPLODE(FROM_JSON(sessions.hits, 'array<struct<product:array<struct<v2ProductName:string>>>>')) AS hit
    LATERAL VIEW EXPLODE(hit.product) AS product
    WHERE product.v2ProductName != 'YouTube Men’s Vintage Henley'
    -- 在此处添加其他29天的子查询，格式相同，只需替换表名中的日期部分
    -- 例如：GA360_GA_SESSIONS_20170703, GA360_GA_SESSIONS_20170704, ..., GA360_GA_SESSIONS_20170731
    -- 注意：表名必须用反引号括起来
) AS all_products
GROUP BY product_name
ORDER BY unique_customers DESC
LIMIT 1;