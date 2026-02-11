-- SQL query to retrieve US patents filed between January 1, 2014 and February 1, 2014
-- Including patent title, abstract, publication date, backward citations, and forward citations

WITH patent_data AS (
    SELECT 
        p."publication_number",
        p."filing_date",
        p."publication_date",
        -- Extract title from title_localized JSON array (assuming first element's text)
        COALESCE(
            TRY_CAST(JSON_EXTRACT_PATH_TEXT(p."title_localized"[0], 'text') AS VARCHAR),
            'No title'
        ) AS patent_title,
        -- Extract abstract from abstract_localized JSON array (assuming first element's text)
        COALESCE(
            TRY_CAST(JSON_EXTRACT_PATH_TEXT(p."abstract_localized"[0], 'text') AS VARCHAR),
            'No abstract'
        ) AS patent_abstract,
        p."citation"
    FROM 
        PATENTS_USPTO_PUBLICATIONS p
    WHERE 
        p."country_code" = 'US'
        AND p."filing_date" >= 20140101 
        AND p."filing_date" <= 20140201
),
-- Parse citation array to get backward citations (citations with filing date before current patent's filing date)
backward_citations AS (
    SELECT 
        pd."publication_number",
        COUNT(DISTINCT c.value:"publication_number") AS backward_citation_count
    FROM 
        patent_data pd,
        LATERAL FLATTEN(INPUT => TRY_PARSE_JSON(pd."citation")) c
    WHERE 
        c.value:"filing_date" IS NOT NULL
        AND TRY_CAST(c.value:"filing_date" AS NUMBER) < pd."filing_date"
    GROUP BY 
        pd."publication_number"
),
-- Parse citation array to get forward citations (citations with publication date within 5 years of current patent's publication date)
forward_citations AS (
    SELECT 
        pd."publication_number",
        COUNT(DISTINCT c.value:"publication_number") AS forward_citation_count
    FROM 
        patent_data pd,
        LATERAL FLATTEN(INPUT => TRY_PARSE_JSON(pd."citation")) c
    WHERE 
        c.value:"publication_date" IS NOT NULL
        AND TRY_CAST(c.value:"publication_date" AS NUMBER) BETWEEN pd."publication_date" AND pd."publication_date" + 50000 -- Assuming YYYYMMDD format, adding 5 years approximately (5*10000)
    GROUP BY 
        pd."publication_number"
)
-- Final selection with all required columns
SELECT 
    pd.patent_title,
    pd.patent_abstract,
    pd."publication_date",
    COALESCE(bc.backward_citation_count, 0) AS backward_citations,
    COALESCE(fc.forward_citation_count, 0) AS forward_citations
FROM 
    patent_data pd
    LEFT JOIN backward_citations bc ON pd."publication_number" = bc."publication_number"
    LEFT JOIN forward_citations fc ON pd."publication_number" = fc."publication_number"
ORDER BY 
    pd."publication_date";