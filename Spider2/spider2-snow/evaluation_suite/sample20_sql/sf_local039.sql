WITH rental_hours AS (
    SELECT 
        c."name" AS category_name,
        SUM(
            CASE 
                WHEN r."return_date" IS NOT NULL THEN 
                    DATEDIFF('HOUR', 
                        TRY_TO_TIMESTAMP(r."rental_date"), 
                        TRY_TO_TIMESTAMP(r."return_date")
                    )
                ELSE 0
            END
        ) AS total_rental_hours
    FROM "RENTAL" r
    JOIN "INVENTORY" i ON r."inventory_id" = i."inventory_id"
    JOIN "FILM_CATEGORY" fc ON i."film_id" = fc."film_id"
    JOIN "CATEGORY" c ON fc."category_id" = c."category_id"
    JOIN "CUSTOMER" cust ON r."customer_id" = cust."customer_id"
    JOIN "ADDRESS" a ON cust."address_id" = a."address_id"
    JOIN "CITY" city ON a."city_id" = city."city_id"
    WHERE city."city" LIKE 'A%' OR city."city" LIKE '%-%'
    GROUP BY c."name"
)
SELECT 
    category_name,
    total_rental_hours
FROM rental_hours
ORDER BY total_rental_hours DESC
LIMIT 1