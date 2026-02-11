-- sf_bq271 完整SQL查询语句
-- 数据源: THELOOK_ECOMMERCE_THELOOK_ECOMMERCE
-- 查询目标: 2021年月度销售报告，按国家、部门、类别分组

SELECT 
    DATE_TRUNC('month', TO_TIMESTAMP("ORDER_ITEMS"."created_at" / 1000000)) AS order_month,
    "USERS"."country" AS user_country,
    "PRODUCTS"."department" AS product_department,
    "PRODUCTS"."category" AS product_category,
    COUNT(DISTINCT "ORDER_ITEMS"."order_id") AS order_count,
    COUNT(DISTINCT "ORDER_ITEMS"."user_id") AS unique_purchasers,
    SUM("PRODUCTS"."retail_price" - "PRODUCTS"."cost") AS profit
FROM "ORDER_ITEMS"
JOIN "ORDERS" ON "ORDER_ITEMS"."order_id" = "ORDERS"."order_id"
JOIN "USERS" ON "ORDER_ITEMS"."user_id" = "USERS"."id"
JOIN "PRODUCTS" ON "ORDER_ITEMS"."product_id" = "PRODUCTS"."id"
JOIN "INVENTORY_ITEMS" ON "ORDER_ITEMS"."inventory_item_id" = "INVENTORY_ITEMS"."id"
WHERE 
    EXTRACT(YEAR FROM TO_TIMESTAMP("ORDER_ITEMS"."created_at" / 1000000)) = 2021
    AND EXTRACT(YEAR FROM TO_TIMESTAMP("USERS"."created_at" / 1000000)) = 2021
    AND EXTRACT(YEAR FROM TO_TIMESTAMP("INVENTORY_ITEMS"."created_at" / 1000000)) = 2021
GROUP BY 
    DATE_TRUNC('month', TO_TIMESTAMP("ORDER_ITEMS"."created_at" / 1000000)),
    "USERS"."country",
    "PRODUCTS"."department",
    "PRODUCTS"."category"
ORDER BY 
    order_month,
    user_country,
    product_department,
    product_category;