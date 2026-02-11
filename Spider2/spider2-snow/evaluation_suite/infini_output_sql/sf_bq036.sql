SELECT 
    AVG(`monthly_commits`) AS `average_monthly_commits`
FROM (
    SELECT 
        `repo_name`,
        YEAR(FROM_UNIXTIME(GET_JSON_OBJECT(`author`, '$.time_sec'))) AS `year`,
        MONTH(FROM_UNIXTIME(GET_JSON_OBJECT(`author`, '$.time_sec'))) AS `month`,
        COUNT(*) AS `monthly_commits`
    FROM GITHUB_REPOS_SAMPLE_COMMITS
    WHERE `repo_name` IN (
        SELECT DISTINCT `repo_name` 
        FROM GITHUB_REPOS_LANGUAGES 
        WHERE GET_JSON_OBJECT(`language`, '$[*].name') LIKE '%Python%'
    )
    AND YEAR(FROM_UNIXTIME(GET_JSON_OBJECT(`author`, '$.time_sec'))) = 2016
    GROUP BY `repo_name`, `year`, `month`
) AS monthly_commit_data