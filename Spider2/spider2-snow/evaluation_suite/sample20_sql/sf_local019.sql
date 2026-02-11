-- WWE_WWE数据库查询：NXT头衔中比赛时间最短的比赛
-- 查询结果：NXT Championship头衔，最短比赛时间为00:43，参赛选手为Bron Breakker和Duke Hudson

SELECT 
    b."name" AS belt_name,
    w1."name" AS wrestler1_name,
    w2."name" AS wrestler2_name,
    m."duration" AS match_duration
FROM "MATCHES" m
JOIN "BELTS" b ON m."title_id" = b."id"
JOIN "WRESTLERS" w1 ON m."winner_id" = w1."id"
JOIN "WRESTLERS" w2 ON m."loser_id" = w2."id"
WHERE b."name" LIKE '%NXT%'
    AND m."title_change" = 0
    AND m."duration" IS NOT NULL
    AND m."duration" != ''
ORDER BY m."duration" ASC
LIMIT 1