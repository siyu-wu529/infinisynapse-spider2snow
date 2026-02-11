-- Query 1: Find the assignee with the most applications in patent category 'A61'
SELECT get_json_object(`assignee_harmonized`, '$[0].name') AS `assignee`, COUNT(*) AS `patent_count`
FROM PATENTS_PUBLICATIONS
WHERE `cpc` RLIKE '"code": "A61[^"]*"'
    AND get_json_object(`assignee_harmonized`, '$[0].name') IS NOT NULL
GROUP BY get_json_object(`assignee_harmonized`, '$[0].name')
ORDER BY `patent_count` DESC
LIMIT 1;

-- Query 2: For the above assignee (PROCTER & GAMBLE), find the year with the most applications
SELECT CAST(SUBSTRING(CAST(`filing_date` AS STRING), 1, 4) AS INT) AS `year`, COUNT(*) AS `patent_count`
FROM PATENTS_PUBLICATIONS
WHERE `cpc` RLIKE '"code": "A61[^"]*"'
    AND get_json_object(`assignee_harmonized`, '$[0].name') = 'PROCTER & GAMBLE'
    AND `filing_date` IS NOT NULL
    AND `filing_date` > 0
GROUP BY CAST(SUBSTRING(CAST(`filing_date` AS STRING), 1, 4) AS INT)
ORDER BY `patent_count` DESC
LIMIT 1;