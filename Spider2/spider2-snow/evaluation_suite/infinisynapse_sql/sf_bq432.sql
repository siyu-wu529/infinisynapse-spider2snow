SELECT 
    report_number,
    reactions,
    outcomes,
    products_brand_name,
    products_industry_code,
    products_role,
    products_industry_name,
    date_created,
    date_started,
    consumer_gender,
    consumer_age,
    consumer_age_unit,
FROM FDA_FDA_FOOD.FOOD_EVENTS
WHERE date_created BETWEEN '2015-01-01' AND '2015-01-31'
    AND date_started BETWEEN '2015-01-01' AND '2015-01-31'
ORDER BY date_created, report_number;