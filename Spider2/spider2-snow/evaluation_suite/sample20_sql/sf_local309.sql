-- F1每个年份得分最高的车手和车队查询
-- 数据源：F1_F1数据库

-- 查询每个年份得分最高的车手
WITH ranked_drivers AS (
    SELECT 
        r.year,
        d.full_name as driver_name,
        SUM(ds.points) as total_points,
        ROW_NUMBER() OVER (PARTITION BY r.year ORDER BY SUM(ds.points) DESC) as rank
    FROM DRIVER_STANDINGS ds
    JOIN RACES r ON ds.race_id = r.race_id
    JOIN DRIVERS d ON ds.driver_id = d.driver_id
    GROUP BY r.year, d.full_name
)
SELECT 
    year,
    driver_name as top_driver,
    total_points as driver_points
FROM ranked_drivers
WHERE rank = 1
ORDER BY year DESC;

-- 注意：车队数据查询存在问题，返回空结果
-- 以下为车队查询语句（仅供参考，实际执行返回空结果）
/*
WITH ranked_constructors AS (
    SELECT 
        r.year,
        c.name as constructor_name,
        SUM(cs.points) as total_points,
        ROW_NUMBER() OVER (PARTITION BY r.year ORDER BY SUM(cs.points) DESC) as rank
    FROM CONSTRUCTOR_STANDINGS cs
    JOIN RACES r ON cs.race_id = r.race_id
    JOIN CONSTRUCTORS c ON cs.constructor_id = c.constructor_id
    GROUP BY r.year, c.name
)
SELECT 
    year,
    constructor_name as top_constructor,
    total_points as constructor_points
FROM ranked_constructors
WHERE rank = 1
ORDER BY year DESC;
*/