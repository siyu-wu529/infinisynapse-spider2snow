SELECT 
    '201704' as "month",
    CASE 
        WHEN "totals":"transactions"::INTEGER >= 1 AND "totals":"totalTransactionRevenue"::INTEGER IS NOT NULL 
        THEN 'purchase'
        WHEN "totals":"transactions"::INTEGER IS NULL AND "totals":"totalTransactionRevenue"::INTEGER IS NULL 
        THEN 'non_purchase'
        ELSE 'other'
    END as "session_type",
    COUNT(*) as "session_count",
    AVG("totals":"pageviews"::INTEGER) as "avg_pageviews_per_visitor"
FROM "GA_SESSIONS_20170401"
WHERE "date" BETWEEN '20170401' AND '20170430'
AND "totals":"pageviews"::INTEGER IS NOT NULL
GROUP BY "session_type"
UNION ALL
SELECT 
    '201705' as "month",
    CASE 
        WHEN "totals":"transactions"::INTEGER >= 1 AND "totals":"totalTransactionRevenue"::INTEGER IS NOT NULL 
        THEN 'purchase'
        WHEN "totals":"transactions"::INTEGER IS NULL AND "totals":"totalTransactionRevenue"::INTEGER IS NULL 
        THEN 'non_purchase'
        ELSE 'other'
    END as "session_type",
    COUNT(*) as "session_count",
    AVG("totals":"pageviews"::INTEGER) as "avg_pageviews_per_visitor"
FROM "GA_SESSIONS_20170501"
WHERE "date" BETWEEN '20170501' AND '20170531'
AND "totals":"pageviews"::INTEGER IS NOT NULL
GROUP BY "session_type"
UNION ALL
SELECT 
    '201706' as "month",
    CASE 
        WHEN "totals":"transactions"::INTEGER >= 1 AND "totals":"totalTransactionRevenue"::INTEGER IS NOT NULL 
        THEN 'purchase'
        WHEN "totals":"transactions"::INTEGER IS NULL AND "totals":"totalTransactionRevenue"::INTEGER IS NULL 
        THEN 'non_purchase'
        ELSE 'other'
    END as "session_type",
    COUNT(*) as "session_count",
    AVG("totals":"pageviews"::INTEGER) as "avg_pageviews_per_visitor"
FROM "GA_SESSIONS_20170601"
WHERE "date" BETWEEN '20170601' AND '20170630'
AND "totals":"pageviews"::INTEGER IS NOT NULL
GROUP BY "session_type"
UNION ALL
SELECT 
    '201707' as "month",
    CASE 
        WHEN "totals":"transactions"::INTEGER >= 1 AND "totals":"totalTransactionRevenue"::INTEGER IS NOT NULL 
        THEN 'purchase'
        WHEN "totals":"transactions"::INTEGER IS NULL AND "totals":"totalTransactionRevenue"::INTEGER IS NULL 
        THEN 'non_purchase'
        ELSE 'other'
    END as "session_type",
    COUNT(*) as "session_count",
    AVG("totals":"pageviews"::INTEGER) as "avg_pageviews_per_visitor"
FROM "GA_SESSIONS_20170701"
WHERE "date" BETWEEN '20170701' AND '20170731'
AND "totals":"pageviews"::INTEGER IS NOT NULL
GROUP BY "session_type"
ORDER BY month, session_type;