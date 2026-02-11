WITH annual_sales AS (
    SELECT 
        CAST(soh."salespersonid" AS NUMBER) AS businessentityid,
        EXTRACT(YEAR FROM TO_DATE(soh."orderdate")) AS sales_year,
        SUM(soh."subtotal") AS total_sales
    FROM "SALESORDERHEADER" soh
    WHERE soh."salespersonid" IS NOT NULL 
      AND TRIM(soh."salespersonid") != ''
      AND CAST(soh."salespersonid" AS NUMBER) IS NOT NULL
    GROUP BY soh."salespersonid", EXTRACT(YEAR FROM TO_DATE(soh."orderdate"))
),
annual_quota AS (
    SELECT 
        sqh."BusinessEntityID" AS businessentityid,
        EXTRACT(YEAR FROM TO_DATE(sqh."QuotaDate")) AS quota_year,
        AVG(sqh."SalesQuota") AS avg_annual_quota
    FROM "SALESPERSONQUOTAHISTORY" sqh
    GROUP BY sqh."BusinessEntityID", EXTRACT(YEAR FROM TO_DATE(sqh."QuotaDate"))
),
salesperson_years AS (
    SELECT DISTINCT
        asl.businessentityid,
        asl.sales_year
    FROM annual_sales asl
    UNION
    SELECT DISTINCT
        aq.businessentityid,
        aq.quota_year
    FROM annual_quota aq
)
SELECT 
    sy.businessentityid AS salesperson_id,
    sy.sales_year AS year,
    COALESCE(asl.total_sales, 0) AS total_sales,
    COALESCE(aq.avg_annual_quota, 0) AS sales_quota,
    COALESCE(asl.total_sales, 0) - COALESCE(aq.avg_annual_quota, 0) AS difference,
    CASE 
        WHEN COALESCE(asl.total_sales, 0) >= COALESCE(aq.avg_annual_quota, 0) THEN '达标'
        ELSE '未达标'
    END AS status
FROM salesperson_years sy
LEFT JOIN annual_sales asl ON sy.businessentityid = asl.businessentityid AND sy.sales_year = asl.sales_year
LEFT JOIN annual_quota aq ON sy.businessentityid = aq.businessentityid AND sy.sales_year = aq.quota_year
WHERE COALESCE(asl.total_sales, 0) > 0 OR COALESCE(aq.avg_annual_quota, 0) > 0
ORDER BY sy.businessentityid, sy.sales_year;