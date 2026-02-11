-- sf002: Top 10 Active Banks with Assets > $10B by Uninsured Assets Percentage (as of 2022-12-31)
-- Data Source: FINANCE__ECONOMICS_CYBERSYN

WITH bank_data AS (
    SELECT 
        e.NAME AS bank_name,
        t_ins.ID_RSSD,
        t_ins.VALUE AS insured_percentage,
        t_ins.DATE,
        t_assets.VALUE AS total_assets
    FROM FINANCIAL_INSTITUTION_TIMESERIES t_ins
    JOIN FINANCIAL_INSTITUTION_ENTITIES e ON t_ins.ID_RSSD = e.ID_RSSD
    JOIN FINANCIAL_INSTITUTION_TIMESERIES t_assets ON 
        t_ins.ID_RSSD = t_assets.ID_RSSD 
        AND t_ins.DATE = t_assets.DATE
        AND t_assets.VARIABLE = 'ASSET'
    WHERE t_ins.VARIABLE = 'ESTINS'  -- % Insured (Estimated)
    AND t_ins.DATE = '2022-12-31'
    AND e.IS_ACTIVE = true
    AND e.CATEGORY = 'Bank'
),
filtered_banks AS (
    SELECT 
        bank_name,
        ID_RSSD,
        insured_percentage,
        (1 - insured_percentage) * 100 AS uninsured_percentage,
        total_assets
    FROM bank_data
    WHERE total_assets > 10000000000  -- Assets > $10 billion
)
SELECT 
    bank_name AS "Bank Name",
    ROUND(uninsured_percentage, 2) AS "Uninsured Assets Percentage",
    ROUND(total_assets, 0) AS "Total Assets (USD)"
FROM filtered_banks
ORDER BY uninsured_percentage DESC
LIMIT 10;