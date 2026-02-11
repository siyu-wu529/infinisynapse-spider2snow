-- sf_bq222.sql
-- Find the CPC technology areas in Germany that had the highest exponential moving average (smoothing factor 0.1) of patent filings per year,
-- specifically for patents granted in December 2016.

WITH german_patents_dec2016 AS (
    -- Step 1: Filter German patents granted in December 2016
    SELECT 
        p."publication_number",
        p."filing_date",
        p."grant_date",
        -- Extract year from filing_date (assuming format YYYYMMDD)
        CAST(SUBSTRING(CAST(p."filing_date" AS STRING), 1, 4) AS INTEGER) AS filing_year,
        cpc.value:"code"::STRING AS cpc_code
    FROM 
        PATENTS.PUBLICATIONS p,
        LATERAL FLATTEN(input => p."cpc") cpc
    WHERE 
        -- German assignee (country_code = 'DE' in assignee_harmonized array)
        EXISTS (
            SELECT 1 
            FROM TABLE(FLATTEN(input => p."assignee_harmonized")) a
            WHERE a.value:"country_code"::STRING = 'DE'
        )
        -- Granted in December 2016 (grant_date between 20161201 and 20161231)
        AND p."grant_date" BETWEEN 20161201 AND 20161231
        AND p."grant_date" != 0
),
cpc_groups AS (
    -- Step 2: Extract CPC group level 4 (first 4 characters of CPC code)
    SELECT 
        publication_number,
        filing_year,
        -- Take first 4 characters as CPC group level 4
        SUBSTRING(cpc_code, 1, 4) AS cpc_group
    FROM german_patents_dec2016
    WHERE cpc_code IS NOT NULL
),
annual_counts AS (
    -- Step 3: Count patents per CPC group per year
    SELECT 
        cpc_group,
        filing_year,
        COUNT(*) AS patent_count
    FROM cpc_groups
    GROUP BY cpc_group, filing_year
    ORDER BY cpc_group, filing_year
),
ema_calculation AS (
    -- Step 4: Calculate exponential moving average (EMA) with smoothing factor 0.1
    -- Using window function and recursive formula: EMA_t = 0.1 * patent_count + 0.9 * EMA_{t-1}
    -- We'll use a recursive CTE to compute EMA sequentially
    SELECT 
        cpc_group,
        filing_year,
        patent_count,
        patent_count AS ema  -- For first year, EMA = patent_count
    FROM annual_counts
    WHERE filing_year = (SELECT MIN(filing_year) FROM annual_counts a WHERE a.cpc_group = annual_counts.cpc_group)
    UNION ALL
    SELECT 
        a.cpc_group,
        a.filing_year,
        a.patent_count,
        0.1 * a.patent_count + 0.9 * e.ema AS ema
    FROM annual_counts a
    INNER JOIN ema_calculation e 
        ON a.cpc_group = e.cpc_group 
        AND a.filing_year = e.filing_year + 1  -- Assuming consecutive years
),
ranked_ema AS (
    -- Step 5: Rank EMA per CPC group to find the highest
    SELECT 
        cpc_group,
        filing_year,
        ema,
        ROW_NUMBER() OVER (PARTITION BY cpc_group ORDER BY ema DESC) AS ema_rank
    FROM ema_calculation
),
top_ema_per_group AS (
    -- Step 6: Select the highest EMA year for each CPC group
    SELECT 
        cpc_group,
        filing_year AS year_with_highest_ema,
        ema AS highest_ema
    FROM ranked_ema
    WHERE ema_rank = 1
),
-- Step 7: Join with CPC_DEFINITION to get full title
final_result AS (
    SELECT 
        cd."titleFull" AS full_title,
        t.cpc_group,
        t.year_with_highest_ema,
        t.highest_ema
    FROM top_ema_per_group t
    LEFT JOIN PATENTS.CPC_DEFINITION cd
        ON t.cpc_group = cd."symbol"
        AND cd."level" = 4
)
SELECT * FROM final_result
ORDER BY cpc_group;