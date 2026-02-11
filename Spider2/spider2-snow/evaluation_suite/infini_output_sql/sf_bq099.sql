-- Step 1: Filter patents with CPC containing 'A01B3' and explode assignee_harmonized
SELECT 
  explode(from_json(`assignee_harmonized`, 'array<struct<country_code:string,name:string>>')) AS assignee_obj,
  `publication_date`,
  `country_code`,
  SUBSTRING(CAST(`publication_date` AS STRING), 1, 4) AS `year`
FROM PATENTS_PUBLICATIONS 
WHERE `cpc` LIKE '%A01B3%'
AS filtered_patents;

-- Step 2: Calculate total applications per assignee
SELECT 
  assignee_obj.`name` AS `assignee_name`,
  COUNT(*) AS `total_applications`
FROM filtered_patents
WHERE assignee_obj.`name` IS NOT NULL AND assignee_obj.`name` != ''
GROUP BY assignee_obj.`name`
AS assignee_totals;

-- Step 3: Select top 3 assignees by total applications
SELECT `assignee_name`, `total_applications`
FROM assignee_totals
ORDER BY `total_applications` DESC
LIMIT 3
AS top_assignees;

-- Step 4: Count applications per assignee per year
SELECT 
  assignee_obj.`name` AS `assignee_name`,
  `year`,
  COUNT(*) AS `applications_in_year`
FROM filtered_patents
WHERE assignee_obj.`name` IS NOT NULL AND assignee_obj.`name` != ''
GROUP BY assignee_obj.`name`, `year`
AS assignee_year_counts;

-- Step 5: Rank years for each assignee by application count
SELECT 
  `assignee_name`,
  `year`,
  `applications_in_year`,
  ROW_NUMBER() OVER (PARTITION BY `assignee_name` ORDER BY `applications_in_year` DESC, `year` DESC) AS `rn`
FROM assignee_year_counts
AS assignee_top_year;

-- Step 6: Join top assignees with their top year
SELECT 
  t.`assignee_name`,
  t.`total_applications`,
  a.`year` AS `top_year`,
  a.`applications_in_year` AS `applications_in_top_year`
FROM top_assignees t
LEFT JOIN assignee_top_year a ON t.`assignee_name` = a.`assignee_name` AND a.`rn` = 1
AS top_assignees_with_top_year;

-- Step 7: Count applications per country code for each assignee in top year
SELECT 
  f.assignee_obj.`name` AS `assignee_name`,
  f.`country_code`,
  COUNT(*) AS `applications_in_country`
FROM filtered_patents f
INNER JOIN top_assignees_with_top_year t ON f.assignee_obj.`name` = t.`assignee_name` AND f.`year` = t.`top_year`
GROUP BY f.assignee_obj.`name`, f.`country_code`
AS assignee_country_counts_in_top_year;

-- Step 8: Final result
SELECT 
  t.`assignee_name`,
  t.`total_applications`,
  t.`top_year`,
  t.`applications_in_top_year`,
  c.`country_code` AS `top_country_code`
FROM top_assignees_with_top_year t
LEFT JOIN assignee_country_counts_in_top_year c ON t.`assignee_name` = c.`assignee_name`
AS final_result;