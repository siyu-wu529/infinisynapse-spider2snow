SELECT fp.family_id, a.abstract
FROM (
    SELECT p.family_id, p.publication_number
    FROM PATENTS_GOOGLE_PUBLICATIONS p
    INNER JOIN (
        SELECT family_id
        FROM PATENTS_GOOGLE_PUBLICATIONS
        WHERE family_id != '-1'
        GROUP BY family_id
        ORDER BY COUNT(*) DESC
        LIMIT 6
    ) t ON p.family_id = t.family_id
    WHERE p.family_id != '-1'
) fp
INNER JOIN PATENTS_GOOGLE_ABS_AND_EMB a ON fp.publication_number = a.publication_number
WHERE a.abstract IS NOT NULL AND a.abstract != ''