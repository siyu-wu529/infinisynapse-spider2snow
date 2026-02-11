-- Query to retrieve the earliest publication numbers, corresponding application numbers,
-- claim numbers, and word counts for the top 100 independent patent claims,
-- based on the highest word count, from claims stats within uspto_oce_claims (filtered by ind_flg='1'),
-- matched with their publication numbers from uspto_oce_claims match,
-- and further joined with patents publications to ensure only the earliest publication for each application is included.
-- Note: This query assumes that uspto_oce_claims corresponds to PATENTSVIEW_CLAIMS_2021,
-- and ind_flg='1' corresponds to dependent IS NULL.

SELECT 
    `claim_number`,
    `word_count`,
    `publication_number`,
    `application_number`,
    `publication_date`
FROM (
    SELECT 
        c.`num` AS `claim_number`,
        LENGTH(c.`text`) - LENGTH(REPLACE(c.`text`, ' ', '')) + 1 AS `word_count`,
        m.`publication_number`,
        p.`application_number`,
        p.`publication_date`,
        ROW_NUMBER() OVER (PARTITION BY p.`application_number` ORDER BY p.`publication_date`) AS `rn`
    FROM PATENTSVIEW_CLAIMS_2021 c
    JOIN PATENTSVIEW_MATCH m ON c.`patent_id` = m.`patent_id`
    JOIN PATENTS_USPTO_PUBLICATIONS p ON m.`publication_number` = p.`publication_number`
    WHERE c.`dependent` IS NULL
) t
WHERE `rn` = 1
ORDER BY `word_count` DESC
LIMIT 100;