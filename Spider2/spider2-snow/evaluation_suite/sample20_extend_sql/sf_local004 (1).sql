-- 查询平均订单支付金额最高的3个客户及其相关指标（使用customer_unique_id）
SELECT 
    c."customer_unique_id",
    COUNT(DISTINCT o."order_id") AS "order_count",
    AVG(p."payment_value") AS "avg_payment_per_order",
    CASE 
        WHEN DATEDIFF(day, MIN(o."order_purchase_timestamp"::TIMESTAMP), MAX(o."order_purchase_timestamp"::TIMESTAMP)) / 7.0 < 1.0 
        THEN 1.0
        ELSE DATEDIFF(day, MIN(o."order_purchase_timestamp"::TIMESTAMP), MAX(o."order_purchase_timestamp"::TIMESTAMP)) / 7.0
    END AS "customer_lifespan_weeks"
FROM "CUSTOMERS" c
JOIN "ORDERS" o ON c."customer_id" = o."customer_id"
JOIN "ORDER_PAYMENTS" p ON o."order_id" = p."order_id"
GROUP BY c."customer_unique_id"
HAVING COUNT(DISTINCT o."order_id") > 0
ORDER BY "avg_payment_per_order" DESC
LIMIT 3