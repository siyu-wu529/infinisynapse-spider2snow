-- 查询2016-2018年每月已交付订单数量的透视报告
-- 每列代表一个年份，每行代表一个月份

SELECT 
    EXTRACT(MONTH FROM TO_DATE("order_purchase_timestamp")) AS "month",
    SUM(CASE WHEN EXTRACT(YEAR FROM TO_DATE("order_purchase_timestamp")) = 2016 AND "order_status" = 'delivered' THEN 1 ELSE 0 END) AS "2016",
    SUM(CASE WHEN EXTRACT(YEAR FROM TO_DATE("order_purchase_timestamp")) = 2017 AND "order_status" = 'delivered' THEN 1 ELSE 0 END) AS "2017",
    SUM(CASE WHEN EXTRACT(YEAR FROM TO_DATE("order_purchase_timestamp")) = 2018 AND "order_status" = 'delivered' THEN 1 ELSE 0 END) AS "2018"
FROM "OLIST_ORDERS"
WHERE EXTRACT(YEAR FROM TO_DATE("order_purchase_timestamp")) IN (2016, 2017, 2018)
GROUP BY EXTRACT(MONTH FROM TO_DATE("order_purchase_timestamp"))
ORDER BY "month"