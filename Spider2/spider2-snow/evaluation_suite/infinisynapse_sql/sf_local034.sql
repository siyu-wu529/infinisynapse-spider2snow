WITH category_payment_counts AS (
    SELECT 
        p."product_category_name" as category,
        pay."payment_type" as payment_method,
        COUNT(pay."order_id") as payment_count
    FROM "OLIST_ORDER_PAYMENTS" pay
    JOIN "OLIST_ORDER_ITEMS" oi ON pay."order_id" = oi."order_id"
    JOIN "OLIST_PRODUCTS" p ON oi."product_id" = p."product_id"
    WHERE p."product_category_name" IS NOT NULL
    GROUP BY p."product_category_name", pay."payment_type"
),
most_preferred_payments AS (
    SELECT 
        category,
        payment_method,
        payment_count,
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY payment_count DESC) as rn
    FROM category_payment_counts
),
category_preferred_counts AS (
    SELECT 
        category,
        payment_method as most_preferred_method,
        payment_count as preferred_method_count
    FROM most_preferred_payments
    WHERE rn = 1
)
SELECT 
    ROUND(AVG(preferred_method_count), 2) as avg_payments_for_preferred_method
FROM category_preferred_counts