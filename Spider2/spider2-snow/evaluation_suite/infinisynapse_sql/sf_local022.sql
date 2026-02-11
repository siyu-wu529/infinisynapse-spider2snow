SELECT 
    p."player_name",
    m."match_id",
    t."name" as player_team,
    t_winner."name" as winning_team,
    SUM(bs."runs_scored") as total_runs
FROM "BALL_BY_BALL" bbb
JOIN "BATSMAN_SCORED" bs ON bbb."match_id" = bs."match_id" 
    AND bbb."over_id" = bs."over_id" 
    AND bbb."ball_id" = bs."ball_id"
    AND bbb."innings_no" = bs."innings_no"
JOIN "PLAYER" p ON bbb."striker" = p."player_id"
JOIN "MATCH" m ON bbb."match_id" = m."match_id"
JOIN "TEAM" t ON bbb."team_batting" = t."team_id"
JOIN "TEAM" t_winner ON m."match_winner" = t_winner."team_id"
WHERE m."match_winner" IS NOT NULL
    AND bbb."team_batting" != m."match_winner"
GROUP BY p."player_name", m."match_id", t."name", t_winner."name"
HAVING SUM(bs."runs_scored") >= 100
ORDER BY total_runs DESC