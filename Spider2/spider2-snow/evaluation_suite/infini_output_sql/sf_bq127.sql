WITH jan_2015_families AS (
    SELECT family_id, MIN(publication_date) AS earliest_date_num
    FROM PATENTS.PUBLICATIONS
    WHERE family_id IS NOT NULL
    GROUP BY family_id
    HAVING to_date(cast(MIN(publication_date) AS string), 'yyyyMMdd') >= '2015-01-01'
       AND to_date(cast(MIN(publication_date) AS string), 'yyyyMMdd') < '2015-02-01'
),
target_family_records AS (
    SELECT p.family_id, p.publication_number, p.country_code, p.cpc, p.ipc, j.earliest_date_num
    FROM PATENTS.PUBLICATIONS p
    INNER JOIN jan_2015_families j ON p.family_id = j.family_id
),
cpc_expanded AS (
    SELECT family_id, publication_number, explode(regexp_extract_all(cpc, '"code": "([^"]+)"', 1)) AS cpc_code
    FROM target_family_records
    WHERE cpc IS NOT NULL AND cpc != '[]'
),
ipc_expanded AS (
    SELECT family_id, publication_number, explode(regexp_extract_all(ipc, '"code": "([^"]+)"', 1)) AS ipc_code
    FROM target_family_records
    WHERE ipc IS NOT NULL AND ipc != '[]'
),
family_basic_info AS (
    SELECT family_id,
           MIN(earliest_date_num) AS earliest_date_num,
           collect_set(publication_number) AS publication_numbers,
           collect_set(country_code) AS country_codes
    FROM target_family_records
    GROUP BY family_id
),
cpc_aggregated AS (
    SELECT family_id, collect_set(cpc_code) AS cpc_codes
    FROM cpc_expanded
    GROUP BY family_id
),
ipc_aggregated AS (
    SELECT family_id, collect_set(ipc_code) AS ipc_codes
    FROM ipc_expanded
    GROUP BY family_id
)
SELECT 
    b.family_id,
    to_date(cast(b.earliest_date_num AS string), 'yyyyMMdd') AS earliest_publication_date,
    array_join(sort_array(b.publication_numbers), ',') AS distinct_publication_numbers,
    array_join(sort_array(b.country_codes), ',') AS distinct_country_codes,
    CASE WHEN c.cpc_codes IS NOT NULL THEN array_join(sort_array(c.cpc_codes), ',') ELSE '' END AS distinct_cpc_codes,
    CASE WHEN i.ipc_codes IS NOT NULL THEN array_join(sort_array(i.ipc_codes), ',') ELSE '' END AS distinct_ipc_codes,
    '' AS citing_families,
    '' AS cited_families
FROM family_basic_info b
LEFT JOIN cpc_aggregated c ON b.family_id = c.family_id
LEFT JOIN ipc_aggregated i ON b.family_id = i.family_id