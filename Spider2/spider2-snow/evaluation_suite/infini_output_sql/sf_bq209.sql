WITH target_patents AS (
    SELECT publication_number, filing_date
    FROM PUBLICATIONS
    WHERE grant_date >= 20100000 AND grant_date < 20110000
      AND application_kind = 'U'
      AND filing_date > 0
),
expanded_citations AS (
    SELECT 
        p.publication_number AS citing_pub,
        p.filing_date AS citing_filing_date,
        p.application_number AS citing_app_num,
        f.value:publication_number::STRING AS cited_pub
    FROM PUBLICATIONS p,
    LATERAL FLATTEN(input => p.citation) f
    WHERE p.citation IS NOT NULL AND ARRAY_SIZE(p.citation) > 0
)
SELECT COUNT(*) AS count_patents_with_one_forward_citation
FROM (
    SELECT 
        t.publication_number,
        COUNT(DISTINCT e.citing_app_num) AS forward_count
    FROM target_patents t
    JOIN expanded_citations e ON t.publication_number = e.cited_pub
    WHERE e.citing_filing_date >= t.filing_date
      AND e.citing_filing_date < DATEADD(year, 10, TO_DATE(CAST(t.filing_date AS STRING), 'YYYYMMDD'))
      AND e.citing_filing_date > 0
    GROUP BY t.publication_number
    HAVING forward_count = 1
) AS sub;