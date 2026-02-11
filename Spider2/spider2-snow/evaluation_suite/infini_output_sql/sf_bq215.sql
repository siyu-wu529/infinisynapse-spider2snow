WITH eligible_patents AS (
  SELECT `publication_number`, `citation`
  FROM PATENTS_PUBLICATIONS
  WHERE `country_code` = 'US'
    AND `kind_code` = 'B2'
    AND `grant_date` BETWEEN 20150101 AND 20181231
),
expanded_citations AS (
  SELECT 
    ep.`publication_number` AS patent,
    explode(from_json(ep.`citation`, 'array<struct<publication_number:string>>')) AS cited
  FROM eligible_patents ep
  WHERE ep.`citation` IS NOT NULL AND ep.`citation` != '[]'
),
cited_pub_nums AS (
  SELECT 
    patent,
    cited.`publication_number` AS cited_pub_num
  FROM expanded_citations
),
cited_ipc_exploded AS (
  SELECT 
    cpn.patent,
    explode(from_json(cited_pat.`ipc`, 'array<struct<code:string>>')) AS ipc_struct
  FROM cited_pub_nums cpn
  LEFT JOIN PATENTS_PUBLICATIONS cited_pat ON cpn.cited_pub_num = cited_pat.`publication_number`
  WHERE cited_pat.`ipc` IS NOT NULL AND cited_pat.`ipc` != '[]'
),
ipc_4digit AS (
  SELECT 
    patent,
    substring(ipc_struct.`code`, 1, 4) AS ipc_4,
    COUNT(*) AS occurrence
  FROM cited_ipc_exploded
  GROUP BY patent, substring(ipc_struct.`code`, 1, 4)
),
originality_scores AS (
  SELECT 
    patent,
    1.0 * (1 - (SUM(occurrence * occurrence) / (SUM(occurrence) * SUM(occurrence)))) AS originality_score
  FROM ipc_4digit
  GROUP BY patent
)
SELECT patent, originality_score
FROM originality_scores
ORDER BY originality_score DESC
LIMIT 1;