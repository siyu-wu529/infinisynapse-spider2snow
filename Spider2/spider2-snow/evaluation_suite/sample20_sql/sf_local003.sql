-- RFM分析：计算不同RFM细分的平均订单销售额
-- 数据源：E_COMMERCE_E_COMMERCE
-- 只考虑状态为'delivered'的订单

WITH 
-- 基础数据：只考虑已送达的订单
order_base AS (
    SELECT 
        o."order_id",
        o."customer_id",
        c."customer_unique_id",
        CAST(o."order_purchase_timestamp" AS TIMESTAMP) AS order_date,
        op."payment_value"
    FROM "ORDERS" o
    JOIN "CUSTOMERS" c ON o."customer_id" = c."customer_id"
    JOIN "ORDER_PAYMENTS" op ON o."order_id" = op."order_id"
    WHERE o."order_status" = 'delivered'
),

-- 计算每个客户的RFM指标
customer_metrics AS (
    SELECT 
        "customer_unique_id",
        MAX(order_date) AS last_purchase_date,
        COUNT(DISTINCT "order_id") AS order_count,
        SUM("payment_value") AS total_spend
    FROM order_base
    GROUP BY "customer_unique_id"
),

-- 计算RFM百分位数和分数
rfm_scores AS (
    SELECT 
        "customer_unique_id",
        last_purchase_date,
        order_count,
        total_spend,
        -- Recency: 距离当前时间的天数（越小越好）
        DATEDIFF('day', last_purchase_date, CURRENT_DATE()) AS recency_days,
        PERCENT_RANK() OVER (ORDER BY DATEDIFF('day', last_purchase_date, CURRENT_DATE()) DESC) AS recency_percentile,
        -- Frequency: 订单数量（越大越好）
        order_count AS frequency,
        PERCENT_RANK() OVER (ORDER BY order_count) AS frequency_percentile,
        -- Monetary: 总消费金额（越大越好）
        total_spend AS monetary,
        PERCENT_RANK() OVER (ORDER BY total_spend) AS monetary_percentile,
        
        -- 计算RFM分数（1-5分）
        CASE 
            WHEN recency_percentile <= 0.2 THEN 1
            WHEN recency_percentile <= 0.4 THEN 2
            WHEN recency_percentile <= 0.6 THEN 3
            WHEN recency_percentile <= 0.8 THEN 4
            ELSE 5
        END AS r_score,
        
        CASE 
            WHEN frequency_percentile >= 0.8 THEN 1
            WHEN frequency_percentile >= 0.6 THEN 2
            WHEN frequency_percentile >= 0.4 THEN 3
            WHEN frequency_percentile >= 0.2 THEN 4
            ELSE 5
        END AS f_score,
        
        CASE 
            WHEN monetary_percentile >= 0.8 THEN 1
            WHEN monetary_percentile >= 0.6 THEN 2
            WHEN monetary_percentile >= 0.4 THEN 3
            WHEN monetary_percentile >= 0.2 THEN 4
            ELSE 5
        END AS m_score
    FROM customer_metrics
),

-- 分配RFM细分
rfm_segments AS (
    SELECT 
        "customer_unique_id",
        last_purchase_date,
        order_count,
        total_spend,
        total_spend / NULLIF(order_count, 0) AS avg_order_value,
        r_score,
        f_score,
        m_score,
        r_score * 100 + f_score * 10 + m_score AS rfm_cell,
        CASE 
            WHEN r_score = 1 AND (f_score + m_score) BETWEEN 1 AND 4 THEN 'Champions'
            WHEN r_score IN (4,5) AND (f_score + m_score) BETWEEN 1 AND 2 THEN 'Cant Lose Them'
            WHEN r_score IN (4,5) AND (f_score + m_score) BETWEEN 3 AND 6 THEN 'Hibernating'
            WHEN r_score IN (4,5) AND (f_score + m_score) BETWEEN 7 AND 10 THEN 'Lost'
            WHEN r_score IN (2,3) AND (f_score + m_score) BETWEEN 1 AND 4 THEN 'Loyal Customers'
            WHEN r_score = 3 AND (f_score + m_score) BETWEEN 5 AND 6 THEN 'Needs Attention'
            WHEN r_score = 1 AND (f_score + m_score) BETWEEN 7 AND 8 THEN 'Recent Users'
            WHEN (r_score = 1 AND (f_score + m_score) BETWEEN 5 AND 6) 
                 OR (r_score = 2 AND (f_score + m_score) BETWEEN 5 AND 8) THEN 'Potential Loyalists'
            WHEN r_score = 1 AND (f_score + m_score) BETWEEN 9 AND 10 THEN 'Price Sensitive'
            WHEN r_score = 2 AND (f_score + m_score) BETWEEN 9 AND 10 THEN 'Promising'
            WHEN r_score = 3 AND (f_score + m_score) BETWEEN 7 AND 10 THEN 'About to Sleep'
            ELSE 'Other'
        END AS rfm_segment
    FROM rfm_scores
)

-- 按RFM细分统计平均订单销售额
SELECT 
    rfm_segment,
    COUNT("customer_unique_id") AS customer_count,
    ROUND(AVG(avg_order_value), 2) AS avg_sales_per_order,
    ROUND(MIN(avg_order_value), 2) AS min_avg_sales,
    ROUND(MAX(avg_order_value), 2) AS max_avg_sales,
    ROUND(STDDEV(avg_order_value), 2) AS std_dev_sales
FROM rfm_segments
WHERE avg_order_value IS NOT NULL
GROUP BY rfm_segment
ORDER BY avg_sales_per_order DESC;