WITH patent_data AS (
    SELECT 
        "publication_number",
        "grant_date",
        "ipc"
    FROM "PUBLICATIONS" 
    WHERE "country_code" = 'US' 
    AND "kind_code" = 'B2' 
    AND "grant_date" >= 20220601 
    AND "grant_date" <= 20220831
    AND "ipc" IS NOT NULL
),
ipc_codes AS (
    SELECT 
        pd."publication_number",
        pd."grant_date",
        GET(ipc.value, 'code')::VARCHAR AS ipc_code
    FROM patent_data pd,
    LATERAL FLATTEN(input => PARSE_JSON(pd."ipc")) ipc
),
four_digit_ipc AS (
    SELECT 
        "publication_number",
        "grant_date",
        SUBSTRING(ipc_code, 1, 4) AS four_digit_code
    FROM ipc_codes
    WHERE ipc_code IS NOT NULL AND LENGTH(ipc_code) >= 4
)
SELECT 
    four_digit_code AS ipc_4_digit,
    COUNT(*) AS patent_count,
    COUNT(DISTINCT "publication_number") AS unique_patents
FROM four_digit_ipc
GROUP BY four_digit_code
ORDER BY patent_count DESC
LIMIT 10;