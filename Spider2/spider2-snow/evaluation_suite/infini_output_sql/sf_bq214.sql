-- SQL query for sf_bq214
-- Find the United States utility patent under B2 classification granted between 2010 and 2014
-- with the most forward citations within a month of its filing date,
-- and identify the most similar patent from the same filing year, regardless of its type.

-- Step 1: Identify US utility patents with B2 classification (CPC code starting with 'B02')
-- and grant date between 2010 and 2014.
WITH us_b2_patents AS (
    SELECT
        p."publication_number",
        p."filing_date",
        p."grant_date",
        p."citation"
    FROM
        PATENTS_PUBLICATIONS p
    WHERE
        p."country_code" = 'US'
        AND p."grant_date" BETWEEN 20100000 AND 20149999
        AND EXISTS (
            SELECT 1
            FROM TABLE(FLATTEN(p."cpc")) cpc
            WHERE cpc.value:"code" LIKE 'B02%'
        )
),

-- Step 2: Expand citation array and count forward citations within 30 days of filing date.
-- Assuming citation array elements have "date" field (YYYYMMDD format).
forward_citations AS (
    SELECT
        u."publication_number",
        u."filing_date",
        COUNT(c.value) AS forward_citations_count
    FROM
        us_b2_patents u,
        LATERAL FLATTEN(u."citation") c
    WHERE
        c.value:"date" IS NOT NULL
        AND c.value:"date" BETWEEN u."filing_date" AND u."filing_date" + 30
    GROUP BY
        u."publication_number", u."filing_date"
),

-- Step 3: Find the patent with the maximum forward citations.
max_citation_patent AS (
    SELECT
        "publication_number",
        "filing_date",
        forward_citations_count
    FROM
        forward_citations
    ORDER BY
        forward_citations_count DESC
    LIMIT 1
),

-- Step 4: Get similar patents from ABS_AND_EMB table for the target patent.
-- Assuming similar array contains publication numbers of similar patents.
similar_patents AS (
    SELECT
        a."publication_number" AS target_patent,
        s.value:"publication_number" AS similar_patent_number
    FROM
        PATENTS_GOOGLE_ABS_AND_EMB a,
        LATERAL FLATTEN(a."similar") s
    WHERE
        a."publication_number" = (SELECT "publication_number" FROM max_citation_patent)
),

-- Step 5: Filter similar patents that have the same filing year as the target patent.
-- We need to get filing_date of similar patents from PUBLICATIONS table.
similar_patents_with_filing_year AS (
    SELECT
        sp.similar_patent_number,
        p."filing_date"
    FROM
        similar_patents sp
        JOIN PATENTS_PUBLICATIONS p ON sp.similar_patent_number = p."publication_number"
    WHERE
        EXTRACT(YEAR FROM TO_DATE(CAST(p."filing_date" AS VARCHAR), 'YYYYMMDD')) =
        EXTRACT(YEAR FROM TO_DATE(CAST((SELECT "filing_date" FROM max_citation_patent) AS VARCHAR), 'YYYYMMDD'))
)

-- Final output: target patent, its forward citations count, and the most similar patent (first one).
SELECT
    m."publication_number" AS patent_number,
    m.forward_citations_count,
    (SELECT similar_patent_number FROM similar_patents_with_filing_year LIMIT 1) AS similar_patent_number
FROM
    max_citation_patent m;