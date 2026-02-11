SELECT COUNT(*) AS count
FROM PATENTS_PUBLICATIONS
WHERE `country_code` = 'US'
  AND `kind_code` = 'B2'
  AND `grant_date` BETWEEN 20080101 AND 20181231
  AND `claims_localized` != '[]'
  AND NOT (CAST(`claims_localized` AS STRING) RLIKE '(?i)claim')