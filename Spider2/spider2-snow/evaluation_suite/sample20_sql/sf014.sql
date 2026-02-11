WITH zip_commute_data AS (
    SELECT 
        f."ZipCode",
        SUM(CASE WHEN f."MetricID" IN ('B08303_012E', 'B08303_013E') THEN f."CensusValueByZip" ELSE 0 END) AS total_commuters_over_1_hour
    FROM "PUBLIC"."Fact_CensusValues_ACS2021_ByZip" f
    WHERE f."ZipCode" LIKE '1%'  -- New York ZIP codes start with 1
    GROUP BY f."ZipCode"
),
state_benchmark AS (
    SELECT 
        SUM("StateBenchmarkValue") AS state_benchmark_over_1_hour,
        MAX("TotalStatePopulation") AS state_population
    FROM "PUBLIC"."Fact_StateBenchmark_ACS2021"
    WHERE "StateAbbrev" = 'NY' AND "MetricID" IN ('B08303_012E', 'B08303_013E')
)
SELECT 
    z."ZipCode" AS zip_code,
    z.total_commuters_over_1_hour AS total_commuters,
    s.state_benchmark_over_1_hour AS state_benchmark,
    s.state_population AS state_population
FROM zip_commute_data z
CROSS JOIN state_benchmark s
ORDER BY z.total_commuters_over_1_hour DESC
LIMIT 1