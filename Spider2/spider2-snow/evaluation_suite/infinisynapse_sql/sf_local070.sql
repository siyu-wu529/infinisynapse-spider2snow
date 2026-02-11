SELECT `city_id`, `city_name`, `country_code_2`, `insert_date`
FROM CITY_LEGISLATION_CITY_LEGISLATION_CITIES 
WHERE `country_code_2` = 'cn' 
AND `insert_date` LIKE '2021-07%'
ORDER BY `insert_date` AS chinese_cities_july_2021;
SELECT 
  `insert_date` AS date,
  INITCAP(`city_name`) AS city_name,
  '最长连续记录' AS streak_type,
  COUNT(*) OVER (PARTITION BY DATE(`insert_date`)) AS streak_length
FROM chinese_cities_july_2021
WHERE `insert_date` IN (
  SELECT `insert_date`
  FROM chinese_cities_july_2021
  GROUP BY `insert_date`
  HAVING COUNT(*) = (SELECT MAX(cnt) FROM (SELECT COUNT(*) as cnt FROM chinese_cities_july_2021 GROUP BY `insert_date`))
)
UNION ALL
SELECT 
  `insert_date` AS date,
  INITCAP(`city_name`) AS city_name,
  '最短连续记录' AS streak_type,
  COUNT(*) OVER (PARTITION BY DATE(`insert_date`)) AS streak_length
FROM chinese_cities_july_2021
WHERE `insert_date` IN (
  SELECT `insert_date`
  FROM chinese_cities_july_2021
  GROUP BY `insert_date`
  HAVING COUNT(*) = (SELECT MIN(cnt) FROM (SELECT COUNT(*) as cnt FROM chinese_cities_july_2021 GROUP BY `insert_date`))
)
ORDER BY streak_type, date AS streak_analysis_result;
SAVE OVERWRITE streak_analysis_result AS csv.`builtin_file_database.sf_local070.csv`;