-- sf_bq028: 基于Github star数量最受欢迎的前8个NPM包的最新版本
-- 数据源: DEPS_DEV_V1_DEPS_DEV_V1

WITH main_packages AS (
    -- 筛选出主要的NPM包（不包含依赖路径）
    SELECT DISTINCT 
        "Name",
        "Version"
    FROM "PACKAGEVERSIONS"
    WHERE "System" = 'NPM'
        AND "Name" NOT LIKE '%>%'  -- 排除依赖路径格式的包名
),
latest_versions AS (
    SELECT 
        "Name",
        MAX("Version") as "LatestVersion"
    FROM main_packages
    GROUP BY "Name"
),
package_stars AS (
    SELECT 
        pv."Name",
        pv."Version",
        p."StarsCount"
    FROM "PACKAGEVERSIONS" pv
    JOIN "PACKAGEVERSIONTOPROJECT" ppt ON 
        pv."System" = ppt."System" 
        AND pv."Name" = ppt."Name" 
        AND pv."Version" = ppt."Version"
    JOIN "PROJECTS" p ON 
        ppt."ProjectType" = p."Type" 
        AND ppt."ProjectName" = p."Name"
    WHERE pv."System" = 'NPM'
        AND p."StarsCount" IS NOT NULL
        AND pv."Name" NOT LIKE '%>%'  -- 排除依赖路径格式的包名
),
ranked_packages AS (
    SELECT 
        ps."Name" as "PackageName",
        ps."Version" as "PackageVersion",
        ps."StarsCount" as "GithubStars",
        ROW_NUMBER() OVER (PARTITION BY ps."Name" ORDER BY ps."StarsCount" DESC) as star_rank
    FROM package_stars ps
    JOIN latest_versions lv ON ps."Name" = lv."Name" AND ps."Version" = lv."LatestVersion"
)
SELECT 
    "PackageName",
    "PackageVersion",
    "GithubStars"
FROM ranked_packages
WHERE star_rank = 1
ORDER BY "GithubStars" DESC
LIMIT 8;