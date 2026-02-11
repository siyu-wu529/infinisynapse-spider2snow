SELECT DISTINCT `category`, `category_name`
FROM IOWA_LIQUOR_SALES_IOWA_LIQUOR_SALES_SALES 
WHERE LOWER(`category_name`) LIKE '%bourbon%' OR LOWER(`category_name`) LIKE '%whiskey%';
SELECT 
    `zip_code`,
    SUM(`sale_dollars`) AS `total_sales`
FROM IOWA_LIQUOR_SALES_IOWA_LIQUOR_SALES_SALES 
WHERE `county` = 'DUBUQUE'
    AND `category` IN (1011200.0, 1011300.0)
    AND EXTRACT(YEAR FROM `date`) = 2022
GROUP BY `zip_code`
ORDER BY `total_sales` DESC;
WITH ranked_sales AS (
    SELECT 
        `zip_code`,
        SUM(`sale_dollars`) AS `total_sales`,
        ROW_NUMBER() OVER (ORDER BY SUM(`sale_dollars`) DESC) AS `rank`
    FROM IOWA_LIQUOR_SALES_IOWA_LIQUOR_SALES_SALES 
    WHERE `county` = 'DUBUQUE'
        AND `category` IN (1011200.0, 1011300.0)
        AND EXTRACT(YEAR FROM `date`) = 2022
    GROUP BY `zip_code`
)
SELECT `zip_code`, `total_sales`, `rank`
FROM ranked_sales
WHERE `rank` = 3;
SELECT 
    `geo_id`,
    `total_pop`,
    (`male_21` + `male_22_to_24` + `male_25_to_29` + `male_30_to_34` + `male_35_to_39` + 
     `male_40_to_44` + `male_45_to_49` + `male_50_to_54` + `male_55_to_59` + `male_65_to_66` + 
     `male_67_to_69` + `male_70_to_74` + `male_75_to_79` + `male_80_to_84` + `male_85_and_over` +
     `female_21` + `female_22_to_24` + `female_25_to_29` + `female_30_to_34` + `female_35_to_39` + 
     `female_40_to_44` + `female_45_to_49` + `female_50_to_54` + `female_55_to_59` + `female_60_to_61` + 
     `female_62_to_64` + `female_65_to_66` + `female_67_to_69` + `female_70_to_74` + `female_75_to_79` + 
     `female_80_to_84` + `female_85_and_over`) AS `population_21_and_over`
FROM CENSUS_BUREAU_ACS_1_CENSUS_BUREAU_ACS_ZIP_CODES_2018_5YR 
WHERE `geo_id` LIKE '%52003%';
SELECT 
    EXTRACT(YEAR FROM `date`) AS `year`,
    EXTRACT(MONTH FROM `date`) AS `month`,
    SUM(`sale_dollars`) AS `monthly_sales`
FROM IOWA_LIQUOR_SALES_IOWA_LIQUOR_SALES_SALES 
WHERE `zip_code` = '52003' 
    AND `category` IN (1011200.0, 1011300.0)
    AND EXTRACT(YEAR FROM `date`) = 2022
GROUP BY EXTRACT(YEAR FROM `date`), EXTRACT(MONTH FROM `date`)
ORDER BY `month`;
WITH population_data AS (
    SELECT 
        `geo_id`,
        (`male_21` + `male_22_to_24` + `male_25_to_29` + `male_30_to_34` + `male_35_to_39` + 
         `male_40_to_44` + `male_45_to_49` + `male_50_to_54` + `male_55_to_59` + `male_65_to_66` + 
         `male_67_to_69` + `male_70_to_74` + `male_75_to_79` + `male_80_to_84` + `male_85_and_over` +
         `female_21` + `female_22_to_24` + `female_25_to_29` + `female_30_to_34` + `female_35_to_39` + 
         `female_40_to_44` + `female_45_to_49` + `female_50_to_54` + `female_55_to_59` + `female_60_to_61` + 
         `female_62_to_64` + `female_65_to_66` + `female_67_to_69` + `female_70_to_74` + `female_75_to_79` + 
         `female_80_to_84` + `female_85_and_over`) AS `population_21_and_over`
    FROM CENSUS_BUREAU_ACS_1_CENSUS_BUREAU_ACS_ZIP_CODES_2018_5YR 
    WHERE `geo_id` LIKE '%52003%'
),
sales_data AS (
    SELECT 
        EXTRACT(YEAR FROM `date`) AS `year`,
        EXTRACT(MONTH FROM `date`) AS `month`,
        SUM(`sale_dollars`) AS `monthly_sales`
    FROM IOWA_LIQUOR_SALES_IOWA_LIQUOR_SALES_SALES 
    WHERE `zip_code` = '52003' 
        AND `category` IN (1011200.0, 1011300.0)
        AND EXTRACT(YEAR FROM `date`) = 2022
    GROUP BY EXTRACT(YEAR FROM `date`), EXTRACT(MONTH FROM `date`)
)
SELECT 
    s.`year`,
    s.`month`,
    s.`monthly_sales`,
    p.`population_21_and_over`,
    ROUND(s.`monthly_sales` / p.`population_21_and_over`, 2) AS `per_capita_sales`
FROM sales_data s
CROSS JOIN population_data p
ORDER BY s.`month`;