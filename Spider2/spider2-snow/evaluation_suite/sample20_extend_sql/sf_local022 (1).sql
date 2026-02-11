-- 查询在输掉比赛的球队中得分不低于100分的球员姓名
-- 数据源: IPL_IPL数据库

SELECT DISTINCT 
    p."player_name" AS "player_name",
    m."match_id" AS "match_id",
    m."match_date" AS "match_date",
    m."team_1" AS "team_1",
    m."team_2" AS "team_2",
    m."match_winner" AS "match_winner",
    pm."team_id" AS "player_team",
    SUM(bs."runs_scored") AS "total_runs"
FROM "MATCH" m
JOIN "PLAYER_MATCH" pm ON m."match_id" = pm."match_id"
JOIN "PLAYER" p ON pm."player_id" = p."player_id"
JOIN "BALL_BY_BALL" bb ON m."match_id" = bb."match_id" AND pm."player_id" = bb."striker"
JOIN "BATSMAN_SCORED" bs ON bb."match_id" = bs."match_id" AND bb."over_id" = bs."over_id" AND bb."ball_id" = bs."ball_id" AND bb."innings_no" = bs."innings_no"
WHERE pm."team_id" != m."match_winner"
GROUP BY p."player_name", m."match_id", m."match_date", m."team_1", m."team_2", m."match_winner", pm."team_id"
HAVING SUM(bs."runs_scored") >= 100
ORDER BY "total_runs" DESC;