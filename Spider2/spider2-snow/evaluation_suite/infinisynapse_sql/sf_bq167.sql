WITH user_votes AS (
    SELECT 
        "FromUserId" AS giver_id,
        "ToUserId" AS receiver_id,
        COUNT(DISTINCT "Id") AS votes_given
    FROM "FORUMMESSAGEVOTES"
    GROUP BY "FromUserId", "ToUserId"
),
reciprocal_votes AS (
    SELECT 
        uv.giver_id,
        uv.receiver_id,
        uv.votes_given,
        COALESCE(uv2.votes_given, 0) AS votes_received_back
    FROM user_votes uv
    LEFT JOIN user_votes uv2 
        ON uv.giver_id = uv2.receiver_id 
        AND uv.receiver_id = uv2.giver_id
)
SELECT 
    giver."UserName" AS giver_username,
    receiver."UserName" AS receiver_username,
    rv.votes_given AS distinct_upvotes_given,
    rv.votes_received_back AS distinct_upvotes_received_back
FROM reciprocal_votes rv
JOIN "USERS" giver ON rv.giver_id = giver."Id"
JOIN "USERS" receiver ON rv.receiver_id = receiver."Id"
ORDER BY rv.votes_given DESC, rv.votes_received_back DESC
LIMIT 1;