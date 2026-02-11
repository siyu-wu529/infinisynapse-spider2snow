WITH latest_versions AS (
    SELECT 
        "Name" as package_name,
        "Version" as latest_version,
        "UpstreamPublishedAt" as published_at,
        ROW_NUMBER() OVER (PARTITION BY "Name" ORDER BY "UpstreamPublishedAt" DESC) as version_rank
    FROM "PACKAGEVERSIONS" 
    WHERE "System" = 'NPM'
        AND "Name" NOT LIKE '%>%'
),
package_stars AS (
    SELECT 
        pvtp."Name" as package_name,
        MAX(p."StarsCount") as max_stars
    FROM "PACKAGEVERSIONTOPROJECT" pvtp
    JOIN "PROJECTS" p ON pvtp."ProjectName" = p."Name" AND pvtp."ProjectType" = p."Type"
    WHERE pvtp."System" = 'NPM' 
        AND p."Type" = 'GITHUB'
        AND p."StarsCount" IS NOT NULL
        AND pvtp."Name" NOT LIKE '%>%'
    GROUP BY pvtp."Name"
)
SELECT 
    lv.package_name,
    lv.latest_version,
    ps.max_stars as github_stars
FROM latest_versions lv
JOIN package_stars ps ON lv.package_name = ps.package_name
WHERE lv.version_rank = 1
ORDER BY ps.max_stars DESC
LIMIT 8;