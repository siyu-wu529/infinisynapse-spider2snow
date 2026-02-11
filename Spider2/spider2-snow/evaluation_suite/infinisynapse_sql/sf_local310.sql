WITH driver_points AS (
    SELECT 
        r."year",
        res."driver_id",
        SUM(res."points") as total_driver_points
    FROM "RESULTS" res
    JOIN "RACES" r ON res."race_id" = r."race_id"
    GROUP BY r."year", res."driver_id"
),
constructor_points AS (
    SELECT 
        r."year",
        res."constructor_id",
        SUM(res."points") as total_constructor_points
    FROM "RESULTS" res
    JOIN "RACES" r ON res."race_id" = r."race_id"
    GROUP BY r."year", res."constructor_id"
),
max_points_per_year AS (
    SELECT 
        dp."year",
        MAX(dp.total_driver_points) as max_driver_points,
        MAX(cp.total_constructor_points) as max_constructor_points
    FROM driver_points dp
    JOIN constructor_points cp ON dp."year" = cp."year"
    GROUP BY dp."year"
),
year_totals AS (
    SELECT 
        "year",
        max_driver_points + max_constructor_points as total_points
    FROM max_points_per_year
)
SELECT 
    "year",
    total_points
FROM year_totals
ORDER BY total_points ASC
LIMIT 3