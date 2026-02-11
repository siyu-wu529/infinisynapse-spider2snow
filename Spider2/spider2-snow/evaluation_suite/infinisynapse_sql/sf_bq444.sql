SELECT 
    b."timestamp" as block_timestamp,
    l."block_number",
    l."transaction_hash",
    CASE 
        WHEN ARRAY_CONTAINS('0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde'::VARIANT, l."topics") THEN 'mint'
        WHEN ARRAY_CONTAINS('0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c'::VARIANT, l."topics") THEN 'burn'
    END as event_type
FROM "LOGS" l
JOIN "BLOCKS" b ON l."block_number" = b."number"
WHERE l."address" = '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8'
AND (
    ARRAY_CONTAINS('0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde'::VARIANT, l."topics")
    OR ARRAY_CONTAINS('0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c'::VARIANT, l."topics")
)
ORDER BY b."timestamp" ASC
LIMIT 5;