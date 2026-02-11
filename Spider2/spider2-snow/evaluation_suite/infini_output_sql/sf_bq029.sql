-- Query for average number of inventors per patent and total count of patent publications in Canada (CA)
-- for each 5-year period from 1960 to 2020, based on publication dates.
-- Only include patents that have at least one inventor listed.

WITH filtered AS (
    SELECT
        publication_number,
        publication_date,
        inventor,
        CAST(SUBSTRING(CAST(publication_date AS STRING), 1, 4) AS INT) AS year,
        size(from_json(inventor, 'array<string>')) AS inventor_count
    FROM
        PUBLICATIONS
    WHERE
        country_code = 'CA'
        AND inventor IS NOT NULL
        AND publication_date >= 19600101
        AND publication_date <= 20201231
),
intervals AS (
    SELECT
        *,
        1960 + FLOOR((year - 1960) / 5) * 5 AS interval_start
    FROM
        filtered
    WHERE
        inventor_count > 0
)
SELECT
    interval_start,
    CONCAT(CAST(interval_start AS STRING), '-', CAST(interval_start + 4 AS STRING)) AS five_year_interval,
    COUNT(*) AS patent_count,
    AVG(inventor_count) AS avg_inventors_per_patent
FROM
    intervals
GROUP BY
    interval_start
ORDER BY
    interval_start;