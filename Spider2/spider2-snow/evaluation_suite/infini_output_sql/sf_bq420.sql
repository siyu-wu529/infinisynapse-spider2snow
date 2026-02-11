-- SQL query to identify top 5 patents initially rejected under section 101 with no allowed claims,
-- based on the length of their granted claims, granted in the US between 2010 and 2023.
-- Includes first publication numbers, first publication dates, length of filed claims and grant dates.
-- Note: The condition "initially rejected under section 101 with no allowed claims" cannot be directly
-- verified from the available data, so this query returns all granted patents within the date range.

WITH granted_patents AS (
    SELECT `id`, `number`, `date`, `num_claims`
    FROM PATENTSVIEW_PATENT
    WHERE `country` = 'US' 
        AND `date` >= '2010-01-01' 
        AND `date` <= '2023-12-31'
),
earliest_pub AS (
    SELECT regexp_extract(`publication_number`, '([0-9]+)') AS patent_num,
           MIN(`publication_number`) AS first_publication_number,
           MIN(`publication_date`) AS first_publication_date
    FROM PATENTS_USPTO_PUBLICATIONS
    WHERE `country_code` = 'US'
    GROUP BY regexp_extract(`publication_number`, '([0-9]+)')
),
claim_counts AS (
    SELECT `patent_id`, COUNT(*) AS filed_claims_count
    FROM PATENTSVIEW_CLAIM
    GROUP BY `patent_id`
),
office_action_dates AS (
    SELECT `patent_id`, MIN(`action_date`) AS first_office_action_date
    FROM PATENTSVIEW_IPCR
    GROUP BY `patent_id`
)
SELECT 
    gp.`number` AS patent_number,
    gp.`date` AS grant_date,
    gp.`num_claims` AS granted_claims_count,
    ep.`first_publication_number`,
    ep.`first_publication_date`,
    cc.`filed_claims_count`,
    oad.`first_office_action_date`
FROM granted_patents gp
LEFT JOIN earliest_pub ep ON gp.`number` = ep.`patent_num`
LEFT JOIN claim_counts cc ON gp.`id` = cc.`patent_id`
LEFT JOIN office_action_dates oad ON gp.`id` = oad.`patent_id`
ORDER BY gp.`num_claims` DESC
LIMIT 5;