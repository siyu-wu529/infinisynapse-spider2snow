WITH monthly_usage AS (
  SELECT 
    EXTRACT(MONTH FROM TO_TIMESTAMP("end_date" / 1000000)) AS "month",
    "subscriber_type",
    SUM("duration_sec") / 60.0 AS "total_minutes"
  FROM "BIKESHARE_TRIPS"
  WHERE EXTRACT(YEAR FROM TO_TIMESTAMP("end_date" / 1000000)) = 2017
    AND "subscriber_type" IN ('Customer', 'Subscriber')
  GROUP BY EXTRACT(MONTH FROM TO_TIMESTAMP("end_date" / 1000000)), "subscriber_type"
),
cumulative_diff AS (
  SELECT 
    "month",
    SUM(CASE WHEN "subscriber_type" = 'Subscriber' THEN "total_minutes" ELSE 0 END) AS "subscriber_minutes",
    SUM(CASE WHEN "subscriber_type" = 'Customer' THEN "total_minutes" ELSE 0 END) AS "customer_minutes",
    ABS(SUM(CASE WHEN "subscriber_type" = 'Subscriber' THEN "total_minutes" ELSE 0 END) - 
        SUM(CASE WHEN "subscriber_type" = 'Customer' THEN "total_minutes" ELSE 0 END)) / 1000.0 AS "abs_diff_thousands"
  FROM monthly_usage
  GROUP BY "month"
)
SELECT 
  "month" AS "month_number",
  "subscriber_minutes" / 1000.0 AS "subscriber_minutes_thousands",
  "customer_minutes" / 1000.0 AS "customer_minutes_thousands",
  "abs_diff_thousands" AS "absolute_difference_thousands"
FROM cumulative_diff
ORDER BY "abs_diff_thousands" DESC
LIMIT 1