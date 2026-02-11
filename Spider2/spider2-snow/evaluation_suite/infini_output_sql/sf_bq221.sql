SELECT 
    r.cpc_group,
    d.titleFull AS cpc_title_full,
    r.filing_year AS best_year,
    r.ema AS highest_ema
FROM (
    SELECT 
        cpc_group,
        filing_year,
        ema,
        ROW_NUMBER() OVER (PARTITION BY cpc_group ORDER BY CAST(ema AS DOUBLE) DESC) AS rn_desc
    FROM (
        SELECT 
            a.cpc_group,
            a.filing_year,
            a.patent_count,
            0.2 * SUM(b.patent_count * POWER(0.8, a.rn - b.rn)) AS ema
        FROM (
            SELECT 
                y.cpc_group,
                y.filing_year,
                y.patent_count,
                ROW_NUMBER() OVER (PARTITION BY y.cpc_group ORDER BY y.filing_year) AS rn
            FROM (
                SELECT 
                    LEFT(SPLIT_PART(get_json_object(cpc, '$[0].code'), '/', 1), 4) AS cpc_group,
                    CAST(SUBSTRING(CAST(filing_date AS STRING), 1, 4) AS INT) AS filing_year,
                    COUNT(*) AS patent_count
                FROM PATENTS_PUBLICATIONS
                WHERE filing_date IS NOT NULL AND filing_date != 0
                    AND application_number IS NOT NULL AND application_number != ''
                    AND cpc IS NOT NULL AND cpc != '[]'
                    AND get_json_object(cpc, '$[0].code') IS NOT NULL
                    AND LENGTH(LEFT(SPLIT_PART(get_json_object(cpc, '$[0].code'), '/', 1), 4)) = 4
                GROUP BY LEFT(SPLIT_PART(get_json_object(cpc, '$[0].code'), '/', 1), 4), filing_year
            ) y
            JOIN PATENTS_CPC_DEFINITION d ON y.cpc_group = d.symbol AND d.level = 5
        ) a
        JOIN (
            SELECT 
                y.cpc_group,
                y.filing_year,
                y.patent_count,
                ROW_NUMBER() OVER (PARTITION BY y.cpc_group ORDER BY y.filing_year) AS rn
            FROM (
                SELECT 
                    LEFT(SPLIT_PART(get_json_object(cpc, '$[0].code'), '/', 1), 4) AS cpc_group,
                    CAST(SUBSTRING(CAST(filing_date AS STRING), 1, 4) AS INT) AS filing_year,
                    COUNT(*) AS patent_count
                FROM PATENTS_PUBLICATIONS
                WHERE filing_date IS NOT NULL AND filing_date != 0
                    AND application_number IS NOT NULL AND application_number != ''
                    AND cpc IS NOT NULL AND cpc != '[]'
                    AND get_json_object(cpc, '$[0].code') IS NOT NULL
                    AND LENGTH(LEFT(SPLIT_PART(get_json_object(cpc, '$[0].code'), '/', 1), 4)) = 4
                GROUP BY LEFT(SPLIT_PART(get_json_object(cpc, '$[0].code'), '/', 1), 4), filing_year
            ) y
            JOIN PATENTS_CPC_DEFINITION d ON y.cpc_group = d.symbol AND d.level = 5
        ) b ON a.cpc_group = b.cpc_group AND b.rn <= a.rn
        GROUP BY a.cpc_group, a.filing_year, a.patent_count, a.rn
    ) ema_calculated
) r
JOIN PATENTS_CPC_DEFINITION d ON r.cpc_group = d.symbol AND d.level = 5
WHERE r.rn_desc = 1
ORDER BY r.cpc_group;