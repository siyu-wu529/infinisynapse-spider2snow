-- 计算所有唯一城市对的平均距离并分配到距离范围
WITH city_pairs_with_distance AS (
    SELECT 
        LEAST(get_json_object(`city`, '$.en'), get_json_object(`city2`, '$.en')) as `city1`,
        GREATEST(get_json_object(`city`, '$.en'), get_json_object(`city2`, '$.en')) as `city2`,
        AVG(`distance_km`) as `avg_distance`,
        CASE 
            WHEN AVG(`distance_km`) < 1000 THEN '0-999'
            WHEN AVG(`distance_km`) < 2000 THEN '1000-1999' 
            WHEN AVG(`distance_km`) < 3000 THEN '2000-2999'
            WHEN AVG(`distance_km`) < 4000 THEN '3000-3999'
            WHEN AVG(`distance_km`) < 5000 THEN '4000-4999'
            WHEN AVG(`distance_km`) < 6000 THEN '5000-5999'
            ELSE '6000+'
        END as `distance_range`
    FROM (
        SELECT 
            a1.`city` as `city`,
            a2.`city` as `city2`,
            -- Haversine formula to calculate distance in km
            6371 * 2 * ASIN(SQRT(
                POWER(SIN(RADIANS((CAST(SPLIT(REPLACE(REPLACE(a2.`coordinates`, '(', ''), ')', ''), ',')[1] AS DOUBLE) - CAST(SPLIT(REPLACE(REPLACE(a1.`coordinates`, '(', ''), ')', ''), ',')[1] AS DOUBLE)) / 2)), 2) +
                COS(RADIANS(CAST(SPLIT(REPLACE(REPLACE(a1.`coordinates`, '(', ''), ')', ''), ',')[1] AS DOUBLE))) * 
                COS(RADIANS(CAST(SPLIT(REPLACE(REPLACE(a2.`coordinates`, '(', ''), ')', ''), ',')[1] AS DOUBLE))) * 
                POWER(SIN(RADIANS((CAST(SPLIT(REPLACE(REPLACE(a2.`coordinates`, '(', ''), ')', ''), ',')[0] AS DOUBLE) - CAST(SPLIT(REPLACE(REPLACE(a1.`coordinates`, '(', ''), ')', ''), ',')[0] AS DOUBLE)) / 2)), 2)
            )) as `distance_km`
        FROM AIRLINES_AIRLINES_FLIGHTS f
        JOIN AIRLINES_AIRLINES_AIRPORTS_DATA a1 ON f.`departure_airport` = a1.`airport_code`
        JOIN AIRLINES_AIRLINES_AIRPORTS_DATA a2 ON f.`arrival_airport` = a2.`airport_code`
        WHERE f.`departure_airport` IS NOT NULL 
          AND f.`arrival_airport` IS NOT NULL
          AND f.`departure_airport` != f.`arrival_airport`
          AND a1.`city` IS NOT NULL 
          AND a2.`city` IS NOT NULL
          AND get_json_object(a1.`city`, '$.en') != get_json_object(a2.`city`, '$.en')
    ) as distance_data
    GROUP BY LEAST(get_json_object(`city`, '$.en'), get_json_object(`city2`, '$.en')), 
             GREATEST(get_json_object(`city`, '$.en'), get_json_object(`city2`, '$.en'))
    HAVING `city1` IS NOT NULL AND `city2` IS NOT NULL
)
-- 统计每个距离范围的唯一城市对数量
SELECT 
    `distance_range`,
    COUNT(*) as `pair_count`
FROM city_pairs_with_distance
GROUP BY `distance_range`
ORDER BY `pair_count` ASC;

-- 结果说明：
-- 包含最少唯一城市对的距离范围是：5000-5999公里，共有3对城市