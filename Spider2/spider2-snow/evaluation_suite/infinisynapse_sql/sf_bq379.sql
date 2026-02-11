SELECT 
    `targetSymbol` AS `ClosestTargetSymbol`,
    `associationScore` AS `AssociationScore`,
    `meanAssociationScore` AS `MeanAssociationScore`,
    `scoreDifference` AS `ScoreDifference`
FROM (
    SELECT 
        `targetSymbol`,
        `associationScore`,
        (SELECT AVG(`associationScore`) FROM (
            SELECT 
                a.`diseaseId`,
                a.`targetId`, 
                a.`score` AS `associationScore`,
                d.`name` AS `diseaseName`,
                t.`approvedSymbol` AS `targetSymbol`
            FROM OPEN_TARGETS_PLATFORM_1_PLATFORM_ASSOCIATIONBYOVERALLDIRECT a
            JOIN OPEN_TARGETS_PLATFORM_1_PLATFORM_DISEASES d ON a.`diseaseId` = d.`id`
            JOIN OPEN_TARGETS_PLATFORM_1_PLATFORM_TARGETS t ON a.`targetId` = t.`id`
            WHERE LOWER(d.`name`) LIKE '%psoriasis%'
        )) AS `meanAssociationScore`,
        ABS(`associationScore` - (SELECT AVG(`associationScore`) FROM (
            SELECT 
                a.`diseaseId`,
                a.`targetId`, 
                a.`score` AS `associationScore`,
                d.`name` AS `diseaseName`,
                t.`approvedSymbol` AS `targetSymbol`
            FROM OPEN_TARGETS_PLATFORM_1_PLATFORM_ASSOCIATIONBYOVERALLDIRECT a
            JOIN OPEN_TARGETS_PLATFORM_1_PLATFORM_DISEASES d ON a.`diseaseId` = d.`id`
            JOIN OPEN_TARGETS_PLATFORM_1_PLATFORM_TARGETS t ON a.`targetId` = t.`id`
            WHERE LOWER(d.`name`) LIKE '%psoriasis%'
        ))) AS `scoreDifference`
    FROM (
        SELECT 
            a.`diseaseId`,
            a.`targetId`, 
            a.`score` AS `associationScore`,
            d.`name` AS `diseaseName`,
            t.`approvedSymbol` AS `targetSymbol`
        FROM OPEN_TARGETS_PLATFORM_1_PLATFORM_ASSOCIATIONBYOVERALLDIRECT a
        JOIN OPEN_TARGETS_PLATFORM_1_PLATFORM_DISEASES d ON a.`diseaseId` = d.`id`
        JOIN OPEN_TARGETS_PLATFORM_1_PLATFORM_TARGETS t ON a.`targetId` = t.`id`
        WHERE LOWER(d.`name`) LIKE '%psoriasis%'
    )
    ORDER BY `scoreDifference` ASC
    LIMIT 1
)