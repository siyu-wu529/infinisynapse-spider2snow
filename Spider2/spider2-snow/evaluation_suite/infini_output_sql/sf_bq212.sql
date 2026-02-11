-- SQL query for task sf_bq212
-- For United States utility patents under the B2 classification granted between June and September of 2022,
-- identify the most frequent 4-digit IPC code for each patent.
-- Then, list the publication numbers and IPC4 codes of patents where this code appears 10 or more times.

WITH expanded_ipc AS (
  SELECT 
    "publication_number",
    SUBSTR(ipc.value:code, 1, 4) AS ipc4
  FROM PUBLICATIONS
  , LATERAL FLATTEN(input => "ipc") ipc
  WHERE "country_code" = 'US'
    AND "kind_code" = 'B2'
    AND "grant_date" >= 20220601
    AND "grant_date" <= 20220930
),
ipc_counts AS (
  SELECT 
    "publication_number",
    ipc4,
    COUNT(*) AS count
  FROM expanded_ipc
  GROUP BY "publication_number", ipc4
),
ranked_ipc AS (
  SELECT 
    "publication_number",
    ipc4,
    count,
    ROW_NUMBER() OVER (PARTITION BY "publication_number" ORDER BY count DESC) AS rn
  FROM ipc_counts
)
SELECT 
  "publication_number",
  ipc4,
  count
FROM ranked_ipc
WHERE rn = 1 AND count >= 10
ORDER BY "publication_number";