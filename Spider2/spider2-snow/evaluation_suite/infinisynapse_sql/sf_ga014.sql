SELECT 
    get_json_object(TRAFFIC_SOURCE, '$.source') AS `source`,
    get_json_object(TRAFFIC_SOURCE, '$.medium') AS `medium`,
    COUNT(*) AS `session_count`
FROM GA4_GA4_OBFUSCATED_SAMPLE_ECOMMERCE_EVENTS_20201201 
WHERE EVENT_NAME = 'session_start' AND EVENT_DATE LIKE '202012%'
GROUP BY get_json_object(TRAFFIC_SOURCE, '$.source'), get_json_object(TRAFFIC_SOURCE, '$.medium')
ORDER BY `session_count` DESC;