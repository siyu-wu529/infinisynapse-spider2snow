SELECT 
    'subplot' as plot_type,
    p."inventory_year" as year,
    p."state_code" as state_code,
    AVG(p."adjustment_factor_for_the_subplot") as average_size
FROM "POPULATION" p
JOIN "CONDITION" c ON p."plot_sequence_number" = c."plot_sequence_number" 
    AND p."inventory_year" = c."inventory_year"
    AND p."state_code" = c."state_code"
WHERE p."evaluation_type" = 'EXPCURR'
    AND c."condition_status_code" = 1
    AND p."inventory_year" IN (2015, 2016, 2017)
    AND p."adjustment_factor_for_the_subplot" IS NOT NULL
GROUP BY p."inventory_year", p."state_code"
ORDER BY p."inventory_year", average_size DESC;
SELECT 
    'macroplot' as plot_type,
    p."inventory_year" as year,
    p."state_code" as state_code,
    AVG(p."adjustment_factor_for_the_macroplot") as average_size
FROM "POPULATION" p
JOIN "CONDITION" c ON p."plot_sequence_number" = c."plot_sequence_number" 
    AND p."inventory_year" = c."inventory_year"
    AND p."state_code" = c."state_code"
WHERE p."evaluation_type" = 'EXPCURR'
    AND c."condition_status_code" = 1
    AND p."inventory_year" IN (2015, 2016, 2017)
    AND p."adjustment_factor_for_the_macroplot" IS NOT NULL
GROUP BY p."inventory_year", p."state_code"
ORDER BY p."inventory_year", average_size DESC;
WITH subplot_ranked AS (
    SELECT 
        'subplot' as plot_type,
        p."inventory_year" as year,
        p."state_code" as state_code,
        AVG(p."adjustment_factor_for_the_subplot") as average_size,
        ROW_NUMBER() OVER (PARTITION BY p."inventory_year" ORDER BY AVG(p."adjustment_factor_for_the_subplot") DESC) as rank
    FROM "POPULATION" p
    JOIN "CONDITION" c ON p."plot_sequence_number" = c."plot_sequence_number" 
        AND p."inventory_year" = c."inventory_year"
        AND p."state_code" = c."state_code"
    WHERE p."evaluation_type" = 'EXPCURR'
        AND c."condition_status_code" = 1
        AND p."inventory_year" IN (2015, 2016, 2017)
        AND p."adjustment_factor_for_the_subplot" IS NOT NULL
    GROUP BY p."inventory_year", p."state_code"
),
macroplot_ranked AS (
    SELECT 
        'macroplot' as plot_type,
        p."inventory_year" as year,
        p."state_code" as state_code,
        AVG(p."adjustment_factor_for_the_macroplot") as average_size,
        ROW_NUMBER() OVER (PARTITION BY p."inventory_year" ORDER BY AVG(p."adjustment_factor_for_the_macroplot") DESC) as rank
    FROM "POPULATION" p
    JOIN "CONDITION" c ON p."plot_sequence_number" = c."plot_sequence_number" 
        AND p."inventory_year" = c."inventory_year"
        AND p."state_code" = c."state_code"
    WHERE p."evaluation_type" = 'EXPCURR'
        AND c."condition_status_code" = 1
        AND p."inventory_year" IN (2015, 2016, 2017)
        AND p."adjustment_factor_for_the_macroplot" IS NOT NULL
    GROUP BY p."inventory_year", p."state_code"
)
SELECT plot_type, year, state_code, average_size
FROM subplot_ranked
WHERE rank = 1
UNION ALL
SELECT plot_type, year, state_code, average_size
FROM macroplot_ranked
WHERE rank = 1
ORDER BY plot_type, year;