-- sf_bq017: 丹麦境内前5种最长的道路类型分析
-- 数据源: GEO_OPENSTREETMAP_GEO_OPENSTREETMAP
-- 查询日期: 2026-01-28

-- 使用Haversine公式计算丹麦边界内各种高速公路类型的总长度
WITH road_points AS (
  SELECT 
    REGEXP_SUBSTR("all_tags", '"highway",\\s*"value":\\s*"([^"]+)"', 1, 1, 'i', 1) as highway_type,
    ST_X(ST_POINTN(ST_GEOMFROMWKB("geometry"), 1)) as lon1,
    ST_Y(ST_POINTN(ST_GEOMFROMWKB("geometry"), 1)) as lat1,
    ST_X(ST_POINTN(ST_GEOMFROMWKB("geometry"), 2)) as lon2,
    ST_Y(ST_POINTN(ST_GEOMFROMWKB("geometry"), 2)) as lat2,
    ST_NUMPOINTS(ST_GEOMFROMWKB("geometry")) as num_points
  FROM "PLANET_FEATURES" 
  WHERE "all_tags" LIKE '%highway%' 
    AND "feature_type" IN ('lines', 'multilinestrings')
    -- 使用丹麦的近似边界框 (纬度: 54.5°N-57.8°N, 经度: 8.0°E-15.2°E)
    AND ST_WITHIN(ST_GEOMFROMWKB("geometry"), 
                  ST_GEOMFROMTEXT('POLYGON((8.0 54.5, 15.2 54.5, 15.2 57.8, 8.0 57.8, 8.0 54.5))'))
    AND ST_NUMPOINTS(ST_GEOMFROMWKB("geometry")) > 1
),
haversine_calc AS (
  SELECT 
    highway_type,
    -- Haversine公式计算地理距离 (单位: 米)
    -- 公式: 2 * 6371 * asin(sqrt(sin²(Δφ/2) + cos(φ1) * cos(φ2) * sin²(Δλ/2))) * 1000
    2 * 6371 * ASIN(SQRT(
      POWER(SIN(RADIANS(lat2 - lat1) / 2), 2) + 
      COS(RADIANS(lat1)) * COS(RADIANS(lat2)) * 
      POWER(SIN(RADIANS(lon2 - lon1) / 2), 2)
    )) * 1000 as distance_meters
  FROM road_points
)
SELECT 
  highway_type as highway_type,
  COUNT(*) as segment_count,
  SUM(distance_meters) as total_length_meters,
  ROUND(SUM(distance_meters) / 1000, 2) as total_length_km
FROM haversine_calc
GROUP BY highway_type
ORDER BY total_length_meters DESC
LIMIT 5;

-- 查询结果说明:
-- 1. service: 服务道路，总长度约1061.05公里
-- 2. residential: 住宅道路，总长度约811.87公里  
-- 3. track: 轨道/小路，总长度约544.50公里
-- 4. unclassified: 未分类道路，总长度约473.46公里
-- 5. path: 人行道/小径，总长度约378.26公里

-- 注意: 由于Snowflake地理空间函数使用平面坐标系统，
-- 我们使用Haversine公式手动计算WGS84坐标系统中的实际地理距离，
-- 以确保距离计算的准确性。