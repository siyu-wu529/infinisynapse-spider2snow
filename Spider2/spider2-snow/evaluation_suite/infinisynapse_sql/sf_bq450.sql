WITH address_transactions AS (
    SELECT 
        `from` AS address,
        block_timestamp,
        block_number,
        `hash` AS transaction_hash,
        'outgoing' AS direction,
        value / 1e18 AS eth_value,
        gas_price * gas_used / 1e18 AS gas_cost,
        status
    FROM ETHEREUM_BLOCKCHAIN_ETHEREUM_BLOCKCHAIN.transactions
    WHERE `from` IS NOT NULL
        AND block_timestamp < '2017-01-01'
    UNION ALL
    SELECT 
        `to` AS address,
        block_timestamp,
        block_number,
        `hash` AS transaction_hash,
        'incoming' AS direction,
        value / 1e18 AS eth_value,
        0 AS gas_cost,
        status
    FROM ETHEREUM_BLOCKCHAIN_ETHEREUM_BLOCKCHAIN.transactions
    WHERE `to` IS NOT NULL
        AND block_timestamp < '2017-01-01'
),
filtered_traces AS (
    SELECT DISTINCT transaction_hash
    FROM ETHEREUM_BLOCKCHAIN_ETHEREUM_BLOCKCHAIN.traces
    WHERE call_type IN ('delegatecall', 'callcode', 'staticcall')
        AND block_timestamp < '2017-01-01'
),
token_transfers AS (
    SELECT 
        `from` AS address,
        block_timestamp,
        'outgoing' AS direction,
        contract_address AS token_address,
        value AS token_value,
        `to` AS counterparty
    FROM ETHEREUM_BLOCKCHAIN_ETHEREUM_BLOCKCHAIN.token_transfers
    WHERE `from` IS NOT NULL
        AND block_timestamp < '2017-01-01'
    UNION ALL
    SELECT 
        `to` AS address,
        block_timestamp,
        'incoming' AS direction,
        contract_address AS token_address,
        value AS token_value,
        `from` AS counterparty
    FROM ETHEREUM_BLOCKCHAIN_ETHEREUM_BLOCKCHAIN.token_transfers
    WHERE `to` IS NOT NULL
        AND block_timestamp < '2017-01-01'
),
mining_rewards AS (
    SELECT 
        miner AS address,
        block_timestamp,
        block_number,
        (2 + uncle_count) * 1e18 / 1e18 AS reward_eth
    FROM ETHEREUM_BLOCKCHAIN_ETHEREUM_BLOCKCHAIN.blocks
    WHERE miner IS NOT NULL
        AND block_timestamp < '2017-01-01'
),
contract_creations AS (
    SELECT 
        `from` AS address,
        block_timestamp,
        contract_address
    FROM ETHEREUM_BLOCKCHAIN_ETHEREUM_BLOCKCHAIN.traces
    WHERE trace_type = 'create'
        AND contract_address IS NOT NULL
        AND block_timestamp < '2017-01-01'
),
contract_bytecode AS (
    SELECT 
        address,
        bytecode,
        LENGTH(bytecode) AS bytecode_size
    FROM ETHEREUM_BLOCKCHAIN_ETHEREUM_BLOCKCHAIN.contracts
    WHERE address IS NOT NULL
),
address_analysis AS (
    SELECT 
        atx.address,
        COUNT(DISTINCT atx.transaction_hash) AS total_transactions,
        COUNT(DISTINCT CASE WHEN atx.direction = 'incoming' THEN atx.transaction_hash END) AS incoming_tx_count,
        COUNT(DISTINCT CASE WHEN atx.direction = 'outgoing' THEN atx.transaction_hash END) AS outgoing_tx_count,
        SUM(CASE WHEN atx.direction = 'incoming' THEN atx.eth_value ELSE 0 END) -
        SUM(CASE WHEN atx.direction = 'outgoing' THEN atx.eth_value + atx.gas_cost ELSE 0 END) AS net_balance,
        COUNT(DISTINCT CASE WHEN atx.direction = 'incoming' THEN t.`from` END) AS unique_incoming_counterparties,
        COUNT(DISTINCT CASE WHEN atx.direction = 'outgoing' THEN t.`to` END) AS unique_outgoing_counterparties,
        AVG(CASE WHEN atx.direction = 'incoming' THEN atx.eth_value END) AS avg_incoming_eth,
        AVG(CASE WHEN atx.direction = 'outgoing' THEN atx.eth_value END) AS avg_outgoing_eth,
        COUNT(DISTINCT DATE(atx.block_timestamp)) AS active_days,
        HOUR(MIN(atx.block_timestamp)) AS first_active_hour,
        HOUR(MAX(atx.block_timestamp)) AS last_active_hour,
        MODE(HOUR(atx.block_timestamp)) AS most_active_hour,
        APPROX_PERCENTILE(HOUR(atx.block_timestamp), 0.5) AS median_active_hour,
        COUNT(DISTINCT CASE WHEN atx.status = 0 THEN atx.transaction_hash END) AS failed_transactions,
        COALESCE(SUM(mr.reward_eth), 0) AS total_mining_rewards,
        COUNT(DISTINCT cc.contract_address) AS contracts_created,
        COUNT(DISTINCT CASE WHEN tt.direction = 'incoming' THEN tt.transaction_hash END) AS erc20_incoming_count,
        COUNT(DISTINCT CASE WHEN tt.direction = 'outgoing' THEN tt.transaction_hash END) AS erc20_outgoing_count,
        COUNT(DISTINCT tt.token_address) AS unique_erc20_tokens,
        COUNT(DISTINCT tt.counterparty) AS unique_erc20_counterparties,
        MAX(cb.bytecode_size) AS max_contract_bytecode_size,
        AVG(cb.bytecode_size) AS avg_contract_bytecode_size
    FROM address_transactions atx
    LEFT JOIN ETHEREUM_BLOCKCHAIN_ETHEREUM_BLOCKCHAIN.transactions t 
        ON atx.transaction_hash = t.`hash`
    LEFT JOIN filtered_traces ft 
        ON atx.transaction_hash = ft.transaction_hash
    LEFT JOIN token_transfers tt 
        ON atx.address = tt.address
    LEFT JOIN mining_rewards mr 
        ON atx.address = mr.address
    LEFT JOIN contract_creations cc 
        ON atx.address = cc.address
    LEFT JOIN contract_bytecode cb 
        ON atx.address = cb.address
    WHERE ft.transaction_hash IS NULL
    GROUP BY atx.address
    HAVING total_transactions > 0
)
SELECT 
    address,
    total_transactions,
    incoming_tx_count,
    outgoing_tx_count,
    net_balance,
    unique_incoming_counterparties,
    unique_outgoing_counterparties,
    avg_incoming_eth,
    avg_outgoing_eth,
    active_days,
    first_active_hour,
    last_active_hour,
    most_active_hour,
    median_active_hour,
    failed_transactions,
    total_mining_rewards,
    contracts_created,
    erc20_incoming_count,
    erc20_outgoing_count,
    unique_erc20_tokens,
    unique_erc20_counterparties,
    max_contract_bytecode_size,
    avg_contract_bytecode_size,
    CURRENT_TIMESTAMP() AS report_generated_at
FROM address_analysis
ORDER BY net_balance DESC, total_transactions DESC;