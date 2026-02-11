-- 查询2014年1月1日至2月1日期间美国专利的引用信息
-- 包括专利标题、摘要、发布日期、向后引用数量和向前引用数量

WITH target_patents AS (
    SELECT 
        "id" as patent_id,
        "title" as patent_title,
        "abstract" as patent_abstract,
        "date" as publication_date,
        CAST(SUBSTRING("date", 1, 10) AS DATE) as pub_date
    FROM "PATENT" 
    WHERE "country" = 'US' 
        AND "date" BETWEEN '2014-01-01' AND '2014-02-01'
),
backward_citations AS (
    SELECT 
        p.patent_id,
        COUNT(DISTINCT uc."citation_id") as backward_citation_count
    FROM target_patents p
    LEFT JOIN "USPATENTCITATION" uc ON p.patent_id = uc."patent_id"
    LEFT JOIN "PATENT" cited ON uc."citation_id" = cited."id"
    WHERE cited."date" < p.publication_date
    GROUP BY p.patent_id
),
forward_citations AS (
    SELECT 
        p.patent_id,
        COUNT(DISTINCT uc."patent_id") as forward_citation_count
    FROM target_patents p
    LEFT JOIN "USPATENTCITATION" uc ON p.patent_id = uc."citation_id"
    LEFT JOIN "PATENT" citing ON uc."patent_id" = citing."id"
    WHERE citing."date" BETWEEN p.publication_date AND DATEADD(year, 5, p.pub_date)
    GROUP BY p.patent_id
)
SELECT 
    p.patent_id,
    p.patent_title,
    p.patent_abstract,
    p.publication_date,
    COALESCE(bc.backward_citation_count, 0) as backward_citations,
    COALESCE(fc.forward_citation_count, 0) as forward_citations
FROM target_patents p
LEFT JOIN backward_citations bc ON p.patent_id = bc.patent_id
LEFT JOIN forward_citations fc ON p.patent_id = fc.patent_id
ORDER BY p.publication_date;