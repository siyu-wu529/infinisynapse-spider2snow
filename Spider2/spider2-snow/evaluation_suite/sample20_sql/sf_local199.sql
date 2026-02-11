-- sf_local199.sql
-- 查询每个商店中员工创建的租赁订单数量最高的年份和月份

WITH monthly_rentals AS (
    SELECT 
        s."store_id" AS "store_id",
        EXTRACT(YEAR FROM TO_DATE(r."rental_date")) AS "year",
        EXTRACT(MONTH FROM TO_DATE(r."rental_date")) AS "month",
        COUNT(*) AS "total_rentals"
    FROM "RENTAL" r
    JOIN "STAFF" s ON r."staff_id" = s."staff_id"
    GROUP BY s."store_id", "year", "month"
),
ranked_months AS (
    SELECT 
        "store_id",
        "year", 
        "month",
        "total_rentals",
        ROW_NUMBER() OVER (PARTITION BY "store_id" ORDER BY "total_rentals" DESC) AS "rank"
    FROM monthly_rentals
)
SELECT 
    "store_id" AS "store_id",
    "year" AS "year",
    "month" AS "month",
    "total_rentals" AS "total_rentals"
FROM ranked_months
WHERE "rank" = 1
ORDER BY "store_id";

-- 结果说明：
-- 商店1：2005年7月，租赁订单3342个
-- 商店2：2005年7月，租赁订单3367个