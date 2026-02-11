WITH address_balances AS (
  -- 计算来自traces的转入转出转账（排除特定call类型，仅成功交易）
  SELECT 
    "address",
    SUM(CASE WHEN "direction" = 'in' THEN "value" ELSE -"value" END) AS trace_balance
  FROM (
    -- 转入（to_address接收）
    SELECT 
      "to_address" AS "address",
      "value",
      'in' AS "direction"
    FROM TRACES 
    WHERE "status" = 1  -- 成功交易
      AND ("call_type" IS NULL OR "call_type" NOT IN ('delegatecall', 'callcode', 'staticcall'))
      AND "to_address" IS NOT NULL
      AND "to_address" != '0x0000000000000000000000000000000000000000'
    
    UNION ALL
    
    -- 转出（from_address发送）
    SELECT 
      "from_address" AS "address",
      "value",
      'out' AS "direction"
    FROM TRACES 
    WHERE "status" = 1  -- 成功交易
      AND ("call_type" IS NULL OR "call_type" NOT IN ('delegatecall', 'callcode', 'staticcall'))
      AND "from_address" IS NOT NULL
      AND "from_address" != '0x0000000000000000000000000000000000000000'
  ) traces_flow
  GROUP BY "address"
  
  UNION ALL
  
  -- 计算矿工奖励（每个区块的gas费用总和）
  SELECT 
    "miner" AS "address",
    SUM("gas_used" * "gas_price") AS trace_balance
  FROM (
    SELECT 
      b."miner",
      b."gas_used",
      t."gas_price"
    FROM BLOCKS b
    JOIN TRANSACTIONS t ON b."number" = t."block_number"
    WHERE b."miner" IS NOT NULL
      AND b."miner" != '0x0000000000000000000000000000000000000000'
  ) miner_rewards
  GROUP BY "miner"
  
  UNION ALL
  
  -- 计算发送者gas费用扣除
  SELECT 
    "from_address" AS "address",
    -SUM("receipt_gas_used" * "gas_price") AS trace_balance
  FROM TRANSACTIONS 
  WHERE "from_address" IS NOT NULL
    AND "from_address" != '0x0000000000000000000000000000000000000000'
    AND "receipt_status" = 1  -- 成功交易
  GROUP BY "from_address"
),

net_balances AS (
  SELECT 
    "address",
    SUM(trace_balance) AS net_balance_wei,
    SUM(trace_balance) / 1e15 AS net_balance_quadrillions  -- 转换为quadrillions (10^15)
  FROM address_balances
  GROUP BY "address"
  HAVING SUM(trace_balance) > 0  -- 只保留有正余额的地址
),

top_addresses AS (
  SELECT 
    "address",
    net_balance_quadrillions
  FROM net_balances
  ORDER BY net_balance_quadrillions DESC
  LIMIT 10
)

SELECT 
  ROUND(AVG(net_balance_quadrillions), 2) AS average_balance_quadrillions
FROM top_addresses