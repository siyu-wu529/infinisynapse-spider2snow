-- 计算摩托车碰撞事故死亡率按头盔使用情况分组
-- 数据源: CALIFORNIA_TRAFFIC_COLLISION_CALIFORNIA_TRAFFIC_COLLISION.parties

-- 统计佩戴头盔的摩托车碰撞事故
SELECT 
    '佩戴头盔' as helmet_usage,
    COUNT(DISTINCT "case_id") as total_collisions,
    SUM("party_number_killed") as total_fatalities,
    ROUND(SUM("party_number_killed") * 100.0 / COUNT(DISTINCT "case_id"), 2) as fatality_rate
FROM "PARTIES"
WHERE "statewide_vehicle_type" IN ('motorcycle or scooter', 'moped')
  AND ("party_safety_equipment_1" LIKE '%motorcycle helmet used%' 
       OR "party_safety_equipment_2" LIKE '%motorcycle helmet used%')
  AND ("party_safety_equipment_1" NOT LIKE '%motorcycle helmet not used%' 
       AND "party_safety_equipment_2" NOT LIKE '%motorcycle helmet not used%')

UNION ALL

-- 统计未佩戴头盔的摩托车碰撞事故
SELECT 
    '未佩戴头盔' as helmet_usage,
    COUNT(DISTINCT "case_id") as total_collisions,
    SUM("party_number_killed") as total_fatalities,
    ROUND(SUM("party_number_killed") * 100.0 / COUNT(DISTINCT "case_id"), 2) as fatality_rate
FROM "PARTIES"
WHERE "statewide_vehicle_type" IN ('motorcycle or scooter', 'moped')
  AND ("party_safety_equipment_1" LIKE '%motorcycle helmet not used%' 
       OR "party_safety_equipment_2" LIKE '%motorcycle helmet not used%')
  AND ("party_safety_equipment_1" NOT LIKE '%motorcycle helmet used%' 
       AND "party_safety_equipment_2" NOT LIKE '%motorcycle helmet used%')