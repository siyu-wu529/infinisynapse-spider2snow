-- 查询Abakan作为出发或到达城市的最长航线距离
SELECT DISTINCT
    f."departure_airport",
    dep."airport_name" as departure_airport_name,
    dep."city" as departure_city,
    f."arrival_airport",
    arr."airport_name" as arrival_airport_name,
    arr."city" as arrival_city,
    -- 解析坐标并计算距离
    ROUND(HAVERSINE(
        CAST(REGEXP_SUBSTR(dep."coordinates", '[0-9.-]+', 1, 2) AS FLOAT),
        CAST(REGEXP_SUBSTR(dep."coordinates", '[0-9.-]+', 1, 1) AS FLOAT),
        CAST(REGEXP_SUBSTR(arr."coordinates", '[0-9.-]+', 1, 2) AS FLOAT),
        CAST(REGEXP_SUBSTR(arr."coordinates", '[0-9.-]+', 1, 1) AS FLOAT)
    ), 2) as distance_km
FROM "FLIGHTS" f
JOIN "AIRPORTS_DATA" dep ON f."departure_airport" = dep."airport_code"
JOIN "AIRPORTS_DATA" arr ON f."arrival_airport" = arr."airport_code"
WHERE f."departure_airport" = 'ABA' OR f."arrival_airport" = 'ABA'
ORDER BY distance_km DESC