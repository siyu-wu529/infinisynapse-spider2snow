SELECT 
    'Top 10' as category_type,
    im."month_year" as time_mm_yyyy,
    imap."interest_name",
    im."composition" as composition_value
FROM "INTEREST_METRICS" im
JOIN "INTEREST_MAP" imap ON im."interest_id" = imap."id"
WHERE (im."interest_id", im."composition") IN (
    SELECT "interest_id", MAX("composition") 
    FROM "INTEREST_METRICS" 
    GROUP BY "interest_id"
)
ORDER BY im."composition" DESC
LIMIT 10
UNION ALL
SELECT 
    'Bottom 10' as category_type,
    im."month_year" as time_mm_yyyy,
    imap."interest_name",
    im."composition" as composition_value
FROM "INTEREST_METRICS" im
JOIN "INTEREST_MAP" imap ON im."interest_id" = imap."id"
WHERE (im."interest_id", im."composition") IN (
    SELECT "interest_id", MAX("composition") 
    FROM "INTEREST_METRICS" 
    GROUP BY "interest_id"
)
ORDER BY im."composition" ASC
LIMIT 10
ORDER BY category_type DESC, composition_value DESC;