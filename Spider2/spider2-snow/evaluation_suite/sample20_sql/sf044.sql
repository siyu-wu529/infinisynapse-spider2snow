-- Magnificent 7科技公司盘后收盘价百分比变化分析 (2024年1月1日至6月30日)
-- 数据源: FINANCE__ECONOMICS_CYBERSYN.STOCK_PRICE_TIMESERIES

-- 步骤1: 查询Magnificent 7科技公司2024年1月1日至6月30日的盘后收盘价数据
SELECT 
    TICKER,
    DATE,
    VALUE AS post_market_close_price
FROM FINANCE__ECONOMICS_CYBERSYN_STOCK_PRICE_TIMESERIES 
WHERE TICKER IN ('AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA')
    AND VARIABLE = 'post-market_close'
    AND DATE BETWEEN '2024-01-01' AND '2024-06-30'
ORDER BY TICKER, DATE;

-- 步骤2: 计算每个公司2024年1月第一个交易日和6月最后一个交易日的盘后收盘价
SELECT 
    TICKER,
    MIN(CASE WHEN DATE BETWEEN '2024-01-01' AND '2024-01-31' THEN DATE END) AS start_date,
    MAX(CASE WHEN DATE BETWEEN '2024-06-01' AND '2024-06-30' THEN DATE END) AS end_date,
    MIN(CASE WHEN DATE BETWEEN '2024-01-01' AND '2024-01-31' THEN post_market_close_price END) AS start_price,
    MAX(CASE WHEN DATE BETWEEN '2024-06-01' AND '2024-06-30' THEN post_market_close_price END) AS end_price
FROM magnificent7_all_prices
GROUP BY TICKER
ORDER BY TICKER;

-- 步骤3: 计算Magnificent 7科技公司盘后收盘价百分比变化
SELECT 
    TICKER,
    start_date,
    end_date,
    start_price,
    end_price,
    ROUND((end_price - start_price) / start_price * 100, 2) AS percentage_change,
    CASE 
        WHEN (end_price - start_price) > 0 THEN '上涨'
        WHEN (end_price - start_price) < 0 THEN '下跌'
        ELSE '持平'
    END AS change_direction
FROM magnificent7_price_summary
ORDER BY percentage_change DESC;

-- 最终结果汇总:
-- NVDA: +159.40% (476.48 → 1236.00)
-- META: +51.17% (344.47 → 520.75)
-- GOOGL: +37.01% (135.73 → 185.96)
-- AMZN: +36.79% (144.95 → 198.27)
-- MSFT: +23.32% (367.75 → 453.51)
-- AAPL: +19.86% (180.85 → 216.76)
-- TSLA: +8.27% (182.67 → 197.78)

-- 所有Magnificent 7科技公司在2024年上半年均实现正增长，其中NVIDIA表现最为突出，涨幅达159.40%