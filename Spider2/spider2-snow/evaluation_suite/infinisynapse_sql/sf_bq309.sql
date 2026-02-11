SELECT 
    q."id" AS question_id,
    q."body",
    LENGTH(q."body") AS body_length,
    u."reputation" AS user_reputation,
    u."up_votes" - u."down_votes" AS net_votes,
    COALESCE(badge_count.total_badges, 0) AS total_badges,
    CASE WHEN q."accepted_answer_id" IS NOT NULL THEN 1 ELSE 0 END AS has_accepted_answer
FROM "POSTS_QUESTIONS" q
JOIN "USERS" u ON q."owner_user_id" = u."id"
LEFT JOIN (SELECT "user_id", COUNT(*) AS total_badges FROM "BADGES" GROUP BY "user_id") badge_count 
    ON q."owner_user_id" = badge_count."user_id"
WHERE q."accepted_answer_id" IS NOT NULL 
   OR EXISTS (
       SELECT 1 FROM "POSTS_ANSWERS" a 
       WHERE a."parent_id" = q."id" 
         AND a."score" > 0 
         AND a."view_count" IS NOT NULL 
         AND a."score" / CAST(a."view_count" AS FLOAT) > 0.01
   )
ORDER BY LENGTH(q."body") DESC
LIMIT 10;