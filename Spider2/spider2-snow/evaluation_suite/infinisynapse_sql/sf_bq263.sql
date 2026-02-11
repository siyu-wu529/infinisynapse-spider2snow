SELECT 
    DATE_TRUNC('MONTH', TO_TIMESTAMP("o"."created_at" / 1000000)) AS "month",
    SUM("oi"."sale_price") AS "total_sales",
    SUM("p"."cost") AS "total_cost",
    COUNT(DISTINCT "o"."order_id") AS "complete_orders",
    SUM("oi"."sale_price" - "p"."cost") AS "total_profit",
    CASE 
        WHEN SUM("p"."cost") > 0 THEN SUM("oi"."sale_price" - "p"."cost") / SUM("p"."cost")
        ELSE 0 
    END AS "profit_to_cost_ratio"
FROM "THELOOK_ECOMMERCE"."THELOOK_ECOMMERCE"."ORDERS" "o"
JOIN "THELOOK_ECOMMERCE"."THELOOK_ECOMMERCE"."ORDER_ITEMS" "oi" 
    ON "o"."order_id" = "oi"."order_id"
JOIN "THELOOK_ECOMMERCE"."THELOOK_ECOMMERCE"."PRODUCTS" "p" 
    ON "oi"."product_id" = "p"."id"
WHERE "o"."status" = 'Complete'
    AND "oi"."status" = 'Complete'
    AND "p"."category" = 'Sleep & Lounge'
    AND TO_TIMESTAMP("o"."created_at" / 1000000) BETWEEN '2023-01-01' AND '2023-12-31'
GROUP BY DATE_TRUNC('MONTH', TO_TIMESTAMP("o"."created_at" / 1000000))
ORDER BY "month"