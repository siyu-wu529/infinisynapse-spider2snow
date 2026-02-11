-- sf011: 纽约州街区组相对于其人口普查区的人口分布分析 (2021年ACS数据)
-- 数据源: CENSUS_GALAXY__ZIP_CODE_TO_BLOCK_GROUP_SAMPLE_INFORMATION_SCHEMA

SELECT 
    bg."BlockGroupID" AS "block_group_id",
    bg."CensusValue" AS "census_value",
    bg."StateFIPS" || '-' || bg."CountyFIPS" || '-' || bg."TractCode" AS "state_county_tract_id",
    t."tract_population" AS "total_tract_population",
    CASE 
        WHEN t."tract_population" = 0 THEN NULL
        ELSE ROUND(bg."CensusValue" * 100.0 / t."tract_population", 2)
    END AS "population_ratio"
FROM (
    SELECT f."BlockGroupID", f."CensusValue", d."StateFIPS", d."CountyFIPS", d."TractCode", d."BlockGroupCode"
    FROM "CENSUS_GALAXY__ZIP_CODE_TO_BLOCK_GROUP_SAMPLE"."PUBLIC"."Fact_CensusValues_ACS2021" f
    JOIN "CENSUS_GALAXY__ZIP_CODE_TO_BLOCK_GROUP_SAMPLE"."PUBLIC"."Dim_CensusGeography" d ON f."BlockGroupID" = d."BlockGroupID"
    WHERE f."MetricID" = 'B01003_001E' AND d."StateFIPS" = '36' -- 纽约州
) bg
JOIN (
    SELECT "StateFIPS", "CountyFIPS", "TractCode", SUM("CensusValue") AS "tract_population"
    FROM "CENSUS_GALAXY__ZIP_CODE_TO_BLOCK_GROUP_SAMPLE"."PUBLIC"."Fact_CensusValues_ACS2021" f
    JOIN "CENSUS_GALAXY__ZIP_CODE_TO_BLOCK_GROUP_SAMPLE"."PUBLIC"."Dim_CensusGeography" d ON f."BlockGroupID" = d."BlockGroupID"
    WHERE f."MetricID" = 'B01003_001E' AND d."StateFIPS" = '36' AND d."BlockGroupCode" IS NOT NULL
    GROUP BY "StateFIPS", "CountyFIPS", "TractCode"
) t ON bg."StateFIPS" = t."StateFIPS" AND bg."CountyFIPS" = t."CountyFIPS" AND bg."TractCode" = t."TractCode"
WHERE t."tract_population" > 0 -- 只包含人口总数大于0的区
ORDER BY bg."StateFIPS", bg."CountyFIPS", bg."TractCode", bg."BlockGroupCode";