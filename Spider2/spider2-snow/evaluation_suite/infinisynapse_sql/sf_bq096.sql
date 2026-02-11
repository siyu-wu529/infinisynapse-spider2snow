WITH daily_counts AS (
  SELECT 
    "year",
    "month", 
    "day",
    COUNT(*) as observation_count,
    DATE_FROM_PARTS("year", "month", "day") as observation_date
  FROM "OCCURRENCES" 
  WHERE "species" = 'Sterna paradisaea'
    AND "decimallatitude" > 40
    AND "month" > 1
    AND "year" IS NOT NULL
    AND "month" IS NOT NULL 
    AND "day" IS NOT NULL
  GROUP BY "year", "month", "day"
  HAVING COUNT(*) > 10
),
first_dates_per_year AS (
  SELECT 
    "year",
    MIN(observation_date) as first_date_after_jan
  FROM daily_counts
  GROUP BY "year"
)
SELECT 
  "year",
  first_date_after_jan,
  ROW_NUMBER() OVER (ORDER BY first_date_after_jan) as rank_by_date
FROM first_dates_per_year
ORDER BY first_date_after_jan;
SELECT * FROM final_answer WHERE RANK_BY_DATE = 1;