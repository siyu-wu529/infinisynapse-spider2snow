WITH volume_converted AS (
  SELECT 
    "ticker",
    "market_date",
    CASE 
      WHEN "volume" = '-' THEN 0
      WHEN RIGHT("volume", 1) = 'K' THEN CAST(REPLACE("volume", 'K', '') AS DOUBLE) * 1000
      WHEN RIGHT("volume", 1) = 'M' THEN CAST(REPLACE("volume", 'M', '') AS DOUBLE) * 1000000
      ELSE CAST("volume" AS DOUBLE)
    END AS "converted_volume"
  FROM "BITCOIN_PRICES"
  WHERE "market_date" BETWEEN '01-08-2021' AND '10-08-2021'
),
volume_with_prev AS (
  SELECT 
    "ticker",
    "market_date",
    "converted_volume",
    LAG("converted_volume") OVER (
      PARTITION BY "ticker" 
      ORDER BY TO_DATE("market_date", 'DD-MM-YYYY')
    ) AS "prev_volume"
  FROM volume_converted
)
SELECT 
  "ticker",
  "market_date",
  "converted_volume",
  "prev_volume",
  CASE 
    WHEN "prev_volume" = 0 OR "prev_volume" IS NULL THEN NULL
    ELSE ROUND((("converted_volume" - "prev_volume") / "prev_volume") * 100, 2)
  END AS "volume_pct_change"
FROM volume_with_prev
ORDER BY "ticker", TO_DATE("market_date", 'DD-MM-YYYY");