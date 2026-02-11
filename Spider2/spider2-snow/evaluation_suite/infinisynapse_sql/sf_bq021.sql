WITH top_bike_routes AS (
  SELECT 
    ROUND("start_station_latitude"::FLOAT, 3) AS "start_lat",
    ROUND("start_station_longitude"::FLOAT, 3) AS "start_lon",
    ROUND("end_station_latitude"::FLOAT, 3) AS "end_lat",
    ROUND("end_station_longitude"::FLOAT, 3) AS "end_lon",
    "start_station_id",
    "end_station_id",
    "start_station_name",
    COUNT(*) AS "trip_count",
    AVG("tripduration") AS "avg_bike_duration_seconds"
  FROM "CITIBIKE_TRIPS"
  WHERE EXTRACT(YEAR FROM TO_TIMESTAMP("starttime"::BIGINT / 1000000)) = 2016
    AND "start_station_latitude" IS NOT NULL
    AND "start_station_longitude" IS NOT NULL
    AND "end_station_latitude" IS NOT NULL
    AND "end_station_longitude" IS NOT NULL
  GROUP BY 
    ROUND("start_station_latitude"::FLOAT, 3),
    ROUND("start_station_longitude"::FLOAT, 3),
    ROUND("end_station_latitude"::FLOAT, 3),
    ROUND("end_station_longitude"::FLOAT, 3),
    "start_station_id",
    "end_station_id",
    "start_station_name"
  ORDER BY "trip_count" DESC
  LIMIT 20
),
taxi_trips AS (
  SELECT 
    ROUND("pickup_latitude"::FLOAT, 3) AS "start_lat",
    ROUND("pickup_longitude"::FLOAT, 3) AS "start_lon",
    ROUND("dropoff_latitude"::FLOAT, 3) AS "end_lat",
    ROUND("dropoff_longitude"::FLOAT, 3) AS "end_lon",
    AVG("dropoff_datetime"::BIGINT - "pickup_datetime"::BIGINT) AS "avg_taxi_duration_seconds"
  FROM "TLC_YELLOW_TRIPS_2016"
  WHERE "pickup_datetime" IS NOT NULL 
    AND "dropoff_datetime" IS NOT NULL
    AND "pickup_latitude" IS NOT NULL
    AND "pickup_longitude" IS NOT NULL
    AND "dropoff_latitude" IS NOT NULL
    AND "dropoff_longitude" IS NOT NULL
    AND "pickup_latitude"::FLOAT != 0
    AND "pickup_longitude"::FLOAT != 0
    AND "dropoff_latitude"::FLOAT != 0
    AND "dropoff_longitude"::FLOAT != 0
  GROUP BY 
    ROUND("pickup_latitude"::FLOAT, 3),
    ROUND("pickup_longitude"::FLOAT, 3),
    ROUND("dropoff_latitude"::FLOAT, 3),
    ROUND("dropoff_longitude"::FLOAT, 3)
)
SELECT 
  "start_station_name",
  "start_lat",
  "start_lon",
  "end_lat",
  "end_lon",
  "trip_count",
  "avg_bike_duration_seconds",
  "avg_taxi_duration_seconds",
  "speed_comparison"
FROM (
  SELECT 
    b."start_station_name",
    b."start_lat",
    b."start_lon",
    b."end_lat",
    b."end_lon",
    b."trip_count",
    b."avg_bike_duration_seconds",
    t."avg_taxi_duration_seconds",
    CASE 
      WHEN b."avg_bike_duration_seconds" < t."avg_taxi_duration_seconds" THEN 'Bike Faster'
      ELSE 'Taxi Faster'
    END AS "speed_comparison"
  FROM top_bike_routes b
  JOIN taxi_trips t 
    ON b."start_lat" = t."start_lat" 
    AND b."start_lon" = t."start_lon"
    AND b."end_lat" = t."end_lat"
    AND b."end_lon" = t."end_lon"
  WHERE b."avg_bike_duration_seconds" < t."avg_taxi_duration_seconds"
)
ORDER BY "avg_bike_duration_seconds" DESC
LIMIT 1