-- IPL板球数据分析：找出在每场比赛中单局失分最多的投手中，整体失分最高的前3名投手
-- 数据源：IPL_IPL数据库

WITH over_runs AS (
    -- 计算每个投手在每场比赛的每个单局中的总失分
    SELECT 
        bb."match_id",
        bb."over_id", 
        bb."bowler",
        SUM(bs."runs_scored") as runs_conceded
    FROM "BALL_BY_BALL" bb
    JOIN "BATSMAN_SCORED" bs ON bb."match_id" = bs."match_id" 
        AND bb."over_id" = bs."over_id" 
        AND bb."ball_id" = bs."ball_id"
    GROUP BY bb."match_id", bb."over_id", bb."bowler"
),
max_runs_per_match AS (
    -- 找出每场比赛中单局的最大失分
    SELECT 
        "match_id",
        MAX(runs_conceded) as max_runs_in_match
    FROM over_runs
    GROUP BY "match_id"
),
max_runs_bowlers AS (
    -- 找出每场比赛中单局失分最多的投手
    SELECT 
        oru."match_id",
        oru."over_id",
        oru."bowler",
        oru.runs_conceded
    FROM over_runs oru
    JOIN max_runs_per_match mrm ON oru."match_id" = mrm."match_id" 
        AND oru.runs_conceded = mrm.max_runs_in_match
),
bowler_ranking AS (
    -- 为每个投手的失分记录排名（每个投手只取最高失分记录）
    SELECT 
        "bowler",
        "runs_conceded",
        "match_id",
        "over_id",
        ROW_NUMBER() OVER (PARTITION BY "bowler" ORDER BY "runs_conceded" DESC) as bowler_rank
    FROM max_runs_bowlers
),
top_3_bowlers AS (
    -- 找出整体失分最高的前3名投手
    SELECT 
        "bowler",
        "runs_conceded",
        "match_id", 
        "over_id"
    FROM bowler_ranking
    WHERE bowler_rank = 1
    ORDER BY "runs_conceded" DESC
    LIMIT 3
)
-- 获取前3名投手的完整信息
SELECT 
    t3b."bowler",
    p."player_name" as bowler_name,
    t3b."runs_conceded",
    t3b."match_id",
    t3b."over_id",
    m."match_date",
    m."venue"
FROM top_3_bowlers t3b
JOIN "PLAYER" p ON t3b."bowler" = p."player_id"
JOIN "MATCH" m ON t3b."match_id" = m."match_id"
ORDER BY t3b."runs_conceded" DESC;