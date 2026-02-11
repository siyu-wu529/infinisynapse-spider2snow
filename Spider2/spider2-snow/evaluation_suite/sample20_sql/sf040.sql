-- sf040: Find the top 10 northernmost addresses in Florida's largest zip code area
-- Data source: US_ADDRESSES__POI_CYBERSYN

WITH largest_zip AS (
    SELECT "ZIP", COUNT(*) as address_count
    FROM "US_ADDRESSES" 
    WHERE "STATE" = 'FL'
    GROUP BY "ZIP"
    ORDER BY address_count DESC
    LIMIT 1
),
northern_addresses AS (
    SELECT 
        a."NUMBER" as address_number,
        a."STREET" as street_name,
        a."STREET_TYPE" as street_type,
        a."LATITUDE",
        a."ZIP"
    FROM "US_ADDRESSES" a
    JOIN largest_zip l ON a."ZIP" = l."ZIP"
    WHERE a."STATE" = 'FL'
    ORDER BY a."LATITUDE" DESC
    LIMIT 10
)
SELECT 
    address_number,
    street_name,
    street_type,
    LATITUDE,
    ZIP
FROM northern_addresses
ORDER BY LATITUDE DESC;