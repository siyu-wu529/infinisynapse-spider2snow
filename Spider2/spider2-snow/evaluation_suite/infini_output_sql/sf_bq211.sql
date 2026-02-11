SELECT family_id, COUNT(DISTINCT application_number) AS distinct_app_count
       FROM PATENTS.PUBLICATIONS
       WHERE family_id IS NOT NULL AND family_id != ''
       GROUP BY family_id
   ),
   large_families AS (
       SELECT family_id
       FROM family_app_count
       WHERE distinct_app_count > 1
   )
   SELECT COUNT(*) AS patent_count
   FROM PATENTS.PUBLICATIONS p
   WHERE p.country_code = 'CN'
     AND p.g