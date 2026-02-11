SELECT 
    SUBSTR(`ipc_item`.`code`, 1, 4) AS `ipc_4digit`,
    COUNT(*) AS `count`
FROM (
    SELECT 
        explode(from_json(`ipc`, 'array<struct<code:string,first:boolean,inventive:boolean,tree:array<string>>>')) as `ipc_item`
    FROM `PUBLICATIONS`
    WHERE `country_code` = 'US' 
        AND `kind_code` = 'B2' 
        AND `grant_date` >= 20220601 
        AND `grant_date` <= 20220831
) t
GROUP BY `ipc_4digit`
ORDER BY `count` DESC
LIMIT 1;