WITH revenue_by_channel AS (
  SELECT 
    "channelGrouping" AS "channel_grouping",
    SUM(CASE 
      WHEN p.value:productRevenue IS NOT NULL THEN p.value:productRevenue::FLOAT 
      ELSE 0 
    END) / 1000000 AS "total_revenue_millions"
  FROM "GA_SESSIONS_20170101" s,
  LATERAL FLATTEN(input => PARSE_JSON(s."hits")) h,
  LATERAL FLATTEN(input => PARSE_JSON(h.value:product), outer => true) p
  WHERE "date" BETWEEN '20170101' AND '20170630'
  GROUP BY "channelGrouping"
),
top_channel AS (
  SELECT "channel_grouping", "total_revenue_millions"
  FROM revenue_by_channel
  WHERE "total_revenue_millions" > 0
  ORDER BY "total_revenue_millions" DESC
  LIMIT 1
),
daily_revenue AS (
  SELECT 
    "date",
    SUM(CASE 
      WHEN p.value:productRevenue IS NOT NULL THEN p.value:productRevenue::FLOAT 
      ELSE 0 
    END) / 1000000 AS "daily_revenue_millions"
  FROM "GA_SESSIONS_20170101" s,
  LATERAL FLATTEN(input => PARSE_JSON(s."hits")) h,
  LATERAL FLATTEN(input => PARSE_JSON(h.value:product), outer => true) p
  WHERE "date" BETWEEN '20170101' AND '20170630'
    AND "channelGrouping" = 'Referral'
  GROUP BY "date"
  HAVING "daily_revenue_millions" > 0
  ORDER BY "daily_revenue_millions" DESC
  LIMIT 1
),
weekly_revenue AS (
  SELECT 
    DATE_TRUNC('week', TO_DATE("date", 'YYYYMMDD')) AS "week_start",
    SUM(CASE 
      WHEN p.value:productRevenue IS NOT NULL THEN p.value:productRevenue::FLOAT 
      ELSE 0 
    END) / 1000000 AS "weekly_revenue_millions"
  FROM "GA_SESSIONS_20170101" s,
  LATERAL FLATTEN(input => PARSE_JSON(s."hits")) h,
  LATERAL FLATTEN(input => PARSE_JSON(h.value:product), outer => true) p
  WHERE "date" BETWEEN '20170101' AND '20170630'
    AND "channelGrouping" = 'Referral'
  GROUP BY DATE_TRUNC('week', TO_DATE("date", 'YYYYMMDD'))
  HAVING "weekly_revenue_millions" > 0
),
monthly_revenue AS (
  SELECT 
    DATE_TRUNC('month', TO_DATE("date", 'YYYYMMDD')) AS "month_start",
    SUM(CASE 
      WHEN p.value:productRevenue IS NOT NULL THEN p.value:productRevenue::FLOAT 
      ELSE 0 
    END) / 1000000 AS "monthly_revenue_millions"
  FROM "GA_SESSIONS_20170101" s,
  LATERAL FLATTEN(input => PARSE_JSON(s."hits")) h,
  LATERAL FLATTEN(input => PARSE_JSON(h.value:product), outer => true) p
  WHERE "date" BETWEEN '20170101' AND '20170630'
    AND "channelGrouping" = 'Referral'
  GROUP BY DATE_TRUNC('month', TO_DATE("date", 'YYYYMMDD'))
  HAVING "monthly_revenue_millions" > 0
)
SELECT 
  tc."channel_grouping" AS "top_traffic_source",
  tc."total_revenue_millions" AS "total_revenue_millions",
  dr."daily_revenue_millions" AS "max_daily_revenue_millions",
  (SELECT MAX("weekly_revenue_millions") FROM weekly_revenue) AS "max_weekly_revenue_millions",
  (SELECT MAX("monthly_revenue_millions") FROM monthly_revenue) AS "max_monthly_revenue_millions"
FROM top_channel tc
CROSS JOIN daily_revenue dr