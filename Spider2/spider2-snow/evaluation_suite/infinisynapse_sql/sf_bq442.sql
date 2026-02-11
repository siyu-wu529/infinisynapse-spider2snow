SELECT 
    "TradeReportID" as trade_report_id,
    "Symbol" as symbol,
    "LastPx" as last_price,
    "StrikePrice" as strike_price,
    "Quantity" as quantity,
    "TradeDate" as trade_date,
    "MaturityDate" as maturity_date,
    "CFICode" as cfi_code,
    "SendingTime" as sending_time,
    "TransactTime" as transact_time
FROM "TRADE_CAPTURE_REPORT" 
ORDER BY "LastPx" DESC 
LIMIT 6