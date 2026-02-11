SELECT COUNT(DISTINCT `USER_PSEUDO_ID`) AS `count`
FROM (
    SELECT DISTINCT `USER_PSEUDO_ID`
    FROM GA4_EVENTS_20210101
    LATERAL VIEW explode(from_json(`EVENT_PARAMS`, 'array<struct<key:string,value:struct<int_value:int>>>')) AS param
    WHERE param.`key` = 'engagement_time_msec' AND param.`value`.`int_value` > 0
    UNION
    SELECT DISTINCT `USER_PSEUDO_ID`
    FROM GA4_EVENTS_20210102
    LATERAL VIEW explode(from_json(`EVENT_PARAMS`, 'array<struct<key:string,value:struct<int_value:int>>>')) AS param
    WHERE param.`key` = 'engagement_time_msec' AND param.`value`.`int_value` > 0
    UNION
    SELECT DISTINCT `USER_PSEUDO_ID`
    FROM GA4_EVENTS_20210103
    LATERAL VIEW explode(from_json(`EVENT_PARAMS`, 'array<struct<key:string,value:struct<int_value:int>>>')) AS param
    WHERE param.`key` = 'engagement_time_msec' AND param.`value`.`int_value` > 0
    UNION
    SELECT DISTINCT `USER_PSEUDO_ID`
    FROM GA4_EVENTS_20210104
    LATERAL VIEW explode(from_json(`EVENT_PARAMS`, 'array<struct<key:string,value:struct<int_value:int>>>')) AS param
    WHERE param.`key` = 'engagement_time_msec' AND param.`value`.`int_value` > 0
    UNION
    SELECT DISTINCT `USER_PSEUDO_ID`
    FROM GA4_EVENTS_20210105
    LATERAL VIEW explode(from_json(`EVENT_PARAMS`, 'array<struct<key:string,value:struct<int_value:int>>>')) AS param
    WHERE param.`key` = 'engagement_time_msec' AND param.`value`.`int_value` > 0
    UNION
    SELECT DISTINCT `USER_PSEUDO_ID`
    FROM GA4_EVENTS_20210106
    LATERAL VIEW explode(from_json(`EVENT_PARAMS`, 'array<struct<key:string,value:struct<int_value:int>>>')) AS param
    WHERE param.`key` = 'engagement_time_msec' AND param.`value`.`int_value` > 0
    UNION
    SELECT DISTINCT `USER_PSEUDO_ID`
    FROM GA4_EVENTS_20210107
    LATERAL VIEW explode(from_json(`EVENT_PARAMS`, 'array<struct<key:string,value:struct<int_value:int>>>')) AS param
    WHERE param.`key` = 'engagement_time_msec' AND param.`value`.`int_value` > 0
) AS seven_day
WHERE `USER_PSEUDO_ID` NOT IN (
    SELECT DISTINCT `USER_PSEUDO_ID`
    FROM GA4_EVENTS_20210106
    LATERAL VIEW explode(from_json(`EVENT_PARAMS`, 'array<struct<key:string,value:struct<int_value:int>>>')) AS param
    WHERE param.`key` = 'engagement_time_msec' AND param.`value`.`int_value` > 0
    UNION
    SELECT DISTINCT `USER_PSEUDO_ID`
    FROM GA4_EVENTS_20210107
    LATERAL VIEW explode(from_json(`EVENT_PARAMS`, 'array<struct<key:string,value:struct<int_value:int>>>')) AS param
    WHERE param.`key` = 'engagement_time_msec' AND param.`value`.`int_value` > 0
)