-- sf_bq127.sql
-- 查询2015年1月首次发布的最早出版物家族的完整信息
-- 数据源：PATENTS_GOOGLE_PATENTS_GOOGLE

WITH jan_2015_families AS (
    -- 获取2015年1月首次发布的家族
    SELECT 
        "family_id",
        MIN("publication_date") as "earliest_publication_date"
    FROM PUBLICATIONS 
    WHERE "publication_date" BETWEEN 20150101 AND 20150131
        AND "family_id" IS NOT NULL 
        AND "family_id" != ''
    GROUP BY "family_id"
),
family_publications AS (
    -- 获取每个家族的所有出版物信息
    SELECT 
        jf."family_id",
        jf."earliest_publication_date",
        p."publication_number",
        p."country_code"
    FROM jan_2015_families jf
    JOIN PUBLICATIONS p ON jf."family_id" = p."family_id"
),
cpc_codes AS (
    -- 提取CPC代码
    SELECT 
        jf."family_id",
        cpc.value:"code"::VARCHAR as cpc_code
    FROM jan_2015_families jf
    JOIN PUBLICATIONS p ON jf."family_id" = p."family_id",
    LATERAL FLATTEN(input => p."cpc") cpc
    WHERE cpc_code IS NOT NULL AND cpc_code != ''
),
ipc_codes AS (
    -- 提取IPC代码
    SELECT 
        jf."family_id",
        ipc.value:"code"::VARCHAR as ipc_code
    FROM jan_2015_families jf
    JOIN PUBLICATIONS p ON jf."family_id" = p."family_id",
    LATERAL FLATTEN(input => p."ipc") ipc
    WHERE ipc_code IS NOT NULL AND ipc_code != ''
),
cited_by_families AS (
    -- 获取引用当前家族的家族ID
    SELECT DISTINCT
        fp."family_id",
        p."family_id" as citing_family_id
    FROM family_publications fp
    JOIN ABS_AND_EMB a ON fp."publication_number" = a."publication_number",
    LATERAL FLATTEN(input => a."cited_by") cited
    JOIN PUBLICATIONS p ON cited.value:"publication_number"::VARCHAR = p."publication_number"
    WHERE p."family_id" IS NOT NULL AND p."family_id" != ''
),
cites_families AS (
    -- 获取当前家族引用的家族ID
    SELECT DISTINCT
        fp."family_id",
        p."family_id" as cited_family_id
    FROM family_publications fp
    JOIN PUBLICATIONS p ON fp."publication_number" = p."publication_number"
    WHERE EXISTS (
        SELECT 1 FROM ABS_AND_EMB a 
        WHERE a."publication_number" = p."publication_number" 
        AND a."cited_by" IS NOT NULL AND a."cited_by" != '[]'
    )
)
SELECT 
    jf."family_id",
    jf."earliest_publication_date",
    LISTAGG(DISTINCT fp."publication_number", ', ') WITHIN GROUP (ORDER BY fp."publication_number") as distinct_publication_numbers,
    LISTAGG(DISTINCT fp."country_code", ', ') WITHIN GROUP (ORDER BY fp."country_code") as distinct_country_codes,
    LISTAGG(DISTINCT cc.cpc_code, ', ') WITHIN GROUP (ORDER BY cc.cpc_code) as distinct_cpc_codes,
    LISTAGG(DISTINCT ic.ipc_code, ', ') WITHIN GROUP (ORDER BY ic.ipc_code) as distinct_ipc_codes,
    LISTAGG(DISTINCT cbf.citing_family_id, ', ') WITHIN GROUP (ORDER BY cbf.citing_family_id) as citing_families,
    LISTAGG(DISTINCT cf.cited_family_id, ', ') WITHIN GROUP (ORDER BY cf.cited_family_id) as cited_families
FROM jan_2015_families jf
LEFT JOIN family_publications fp ON jf."family_id" = fp."family_id"
LEFT JOIN cpc_codes cc ON jf."family_id" = cc."family_id"
LEFT JOIN ipc_codes ic ON jf."family_id" = ic."family_id"
LEFT JOIN cited_by_families cbf ON jf."family_id" = cbf."family_id"
LEFT JOIN cites_families cf ON jf."family_id" = cf."family_id"
GROUP BY jf."family_id", jf."earliest_publication_date"
ORDER BY jf."family_id"