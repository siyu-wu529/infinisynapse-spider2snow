WITH airport_coords AS (
  SELECT 
    "airport_code",
    JSON_EXTRACT_PATH_TEXT("city", 'en') AS "city_name",
    SPLIT_PART(REPLACE(REPLACE("coordinates", '(', ''), ')', ''), ',', 1)::FLOAT AS "longitude",
    SPLIT_PART(REPLACE(REPLACE("coordinates", '(', ''), ')', ''), ',', 2)::FLOAT AS "latitude"
  FROM "AIRPORTS_DATA"
),
flight_routes AS (
  SELECT DISTINCT
    f."departure_airport",
    f."arrival_airport"
  FROM "FLIGHTS" f
),
city_pairs_with_coords AS (
  SELECT 
    fc."departure_airport",
    fc."arrival_airport",
    dep."city_name" AS "departure_city",
    arr."city_name" AS "arrival_city",
    dep."longitude" AS "dep_lon",
    dep."latitude" AS "dep_lat",
    arr."longitude" AS "arr_lon",
    arr."latitude" AS "arr_lat"
  FROM flight_routes fc
  JOIN airport_coords dep ON fc."departure_airport" = dep."airport_code"
  JOIN airport_coords arr ON fc."arrival_airport" = arr."airport_code"
  WHERE dep."city_name" != arr."city_name"
),
city_pairs_distance AS (
  SELECT 
    CASE 
      WHEN "departure_city" < "arrival_city" THEN "departure_city"
      ELSE "arrival_city"
    END AS "city1",
    CASE 
      WHEN "departure_city" < "arrival_city" THEN "arrival_city"
      ELSE "departure_city"
    END AS "city2",
    6371 * 2 * ASIN(SQRT(
      POWER(SIN(RADIANS("arr_lat" - "dep_lat") / 2), 2) +
      COS(RADIANS("dep_lat")) * COS(RADIANS("arr_lat")) * 
      POWER(SIN(RADIANS("arr_lon" - "dep_lon") / 2), 2)
    )) AS "distance_km"
  FROM city_pairs_with_coords
),
city_pairs_avg_distance AS (
  SELECT 
    "city1",
    "city2",
    AVG("distance_km") AS "avg_distance_km"
  FROM city_pairs_distance
  GROUP BY "city1", "city2"
),
distance_ranges AS (
  SELECT 
    "city1",
    "city2",
    "avg_distance_km",
    CASE 
      WHEN "avg_distance_km" < 1000 THEN '0-1000'
      WHEN "avg_distance_km" < 2000 THEN '1000-2000'
      WHEN "avg_distance_km" < 3000 THEN '2000-3000'
      WHEN "avg_distance_km" < 4000 THEN '3000-4000'
      WHEN "avg_distance_km" < 5000 THEN '4000-5000'
      WHEN "avg_distance_km" < 6000 THEN '5000-6000'
      ELSE '6000+'
    END AS "distance_range"
  FROM city_pairs_avg_distance
),
range_counts AS (
  SELECT 
    "distance_range",
    COUNT(*) AS "pair_count"
  FROM distance_ranges
  GROUP BY "distance_range"
  ORDER BY "pair_count" ASC
)
SELECT * FROM range_counts;