WITH a61_patents AS (
    SELECT publication_number, assignee_harmonized
    FROM PATENTS_PUBLICATIONS
    WHERE ipc LIKE '%A61%' OR cpc LIKE '%A61%'
),
a61_patents_assignees AS (
    SELECT publication_number, explode(from_json(assignee_harmonized, 'array<struct<country_code:string,name:string>>')) AS assignee_info
    FROM a61_patents
),
top_assignee AS (
    SELECT assignee_info.name AS assignee_name, COUNT(DISTINCT publication_number) AS patent_count
    FROM a61_patents_assignees
    GROUP BY assignee_info.name
    ORDER BY patent_count DESC
    LIMIT 1
),
busiest_year AS (
    SELECT CAST(p.filing_date/10000 AS INT) AS year, COUNT(DISTINCT p.publication_number) AS patent_count
    FROM PATENTS_PUBLICATIONS p
    INNER JOIN a61_patents_assignees a ON p.publication_number = a.publication_number
    INNER JOIN top_assignee t ON a.assignee_info.name = t.assignee_name
    GROUP BY CAST(p.filing_date/10000 AS INT)
    ORDER BY patent_count DESC
    LIMIT 1
),
ranked_jurisdictions AS (
    SELECT p.country_code, COUNT(DISTINCT p.publication_number) AS patent_count
    FROM PATENTS_PUBLICATIONS p
    INNER JOIN a61_patents_assignees a ON p.publication_number = a.publication_number
    INNER JOIN top_assignee t ON a.assignee_info.name = t.assignee_name
    WHERE CAST(p.filing_date/10000 AS INT) = (SELECT year FROM busiest_year)
    GROUP BY p.country_code
    ORDER BY patent_count DESC
    LIMIT 5
)
SELECT concat_ws(',', collect_list(country_code)) AS top_jurisdictions
FROM ranked_jurisdictions