WITH target_cpc AS (
    SELECT DISTINCT c.value:code::VARCHAR AS cpc_code
    FROM "ABS_AND_EMB",
    LATERAL FLATTEN(input => "cpc") c
    WHERE "publication_number" = 'US-9741766-B2'
),
patents_with_cpc AS (
    SELECT 
        p."publication_number",
        p."filing_date",
        c.value:code::VARCHAR AS cpc_code
    FROM "PUBLICATIONS" p
    JOIN "ABS_AND_EMB" a ON p."publication_number" = a."publication_number",
    LATERAL FLATTEN(input => a."cpc") c
    WHERE p."filing_date" > 0 
    AND EXTRACT(YEAR FROM TO_DATE(p."filing_date"::VARCHAR, 'YYYYMMDD')) = 2016
    AND p."publication_number" != 'US-9741766-B2'
)
SELECT DISTINCT
    p."publication_number",
    p."filing_date"
FROM patents_with_cpc p
WHERE p.cpc_code IN (SELECT cpc_code FROM target_cpc)
ORDER BY p."publication_number"
LIMIT 5;