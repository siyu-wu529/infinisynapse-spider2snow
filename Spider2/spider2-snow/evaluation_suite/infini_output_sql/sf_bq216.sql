-- Identify the top five patents filed in the same year as US-9741766-B2 that are most similar based on CPC overlap.
-- This query finds patents filed in 2016 (same year as US-9741766-B2) and calculates the number of overlapping CPC codes with the target patent.
-- Results are ordered by overlap count descending, limited to top 5.

SELECT p.`publication_number`, 
       SIZE(array_intersect(p.`cpc_array`, t.`target_cpc`)) AS `overlap_count`
FROM (
    SELECT `publication_number`, 
           transform(from_json(`cpc`, 'array<struct<code:string>>'), x -> x.`code`) AS `cpc_array`
    FROM PATENTS_GOOGLE_PUBLICATIONS
    WHERE `filing_date` >= 20160101 AND `filing_date` <= 20161231 
      AND `publication_number` != 'US-9741766-B2'
) p
CROSS JOIN (
    SELECT transform(from_json(`cpc`, 'array<struct<code:string>>'), x -> x.`code`) AS `target_cpc`
    FROM PATENTS_GOOGLE_PUBLICATIONS
    WHERE `publication_number` = 'US-9741766-B2'
) t
ORDER BY `overlap_count` DESC
LIMIT 5;