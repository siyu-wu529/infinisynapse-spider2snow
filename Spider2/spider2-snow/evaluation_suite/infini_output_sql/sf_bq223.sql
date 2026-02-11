SELECT 
  ca.citing_assignee_organization,
  sg.title AS cpc_subclass_title,
  COUNT(*) AS citation_count
FROM (
  -- citing_citations: 引用DENSO专利的引用记录，且引用专利有有效申请日期
  SELECT uc.`patent_id` AS citing_patent_id, uc.`citation_id`
  FROM PATENTSVIEW_USPATENTCITATION uc
  INNER JOIN PATENTSVIEW_PATENT p ON uc.`patent_id` = p.`id`
  WHERE uc.`citation_id` IN (
    -- denso_patents: DENSO的专利列表
    SELECT DISTINCT `patent_id`
    FROM PATENTSVIEW_PATENT_ASSIGNEE
    WHERE `assignee_id` IN (
      SELECT `id`
      FROM PATENTSVIEW_ASSIGNEE
      WHERE `organization` LIKE '%DENSO%'
    )
  )
  AND p.`date` IS NOT NULL
) cc
INNER JOIN (
  -- citing_assignees: 引用专利的受让人（排除DENSO）
  SELECT pa.`patent_id`, a.`organization` AS citing_assignee_organization
  FROM PATENTSVIEW_PATENT_ASSIGNEE pa
  INNER JOIN PATENTSVIEW_ASSIGNEE a ON pa.`assignee_id` = a.`id`
  WHERE pa.`assignee_id` NOT IN (
    SELECT `id`
    FROM PATENTSVIEW_ASSIGNEE
    WHERE `organization` LIKE '%DENSO%'
  )
) ca ON cc.citing_patent_id = ca.patent_id
INNER JOIN (
  -- first_cpc: 每个专利的第一个CPC子组
  SELECT c1.`patent_id`, c1.`subgroup_id`, c1.`sequence`
  FROM PATENTSVIEW_CPC_CURRENT c1
  INNER JOIN (
    SELECT `patent_id`, MIN(`sequence`) AS min_seq
    FROM PATENTSVIEW_CPC_CURRENT
    GROUP BY `patent_id`
  ) c2 ON c1.`patent_id` = c2.`patent_id AND c1.`sequence` = c2.min_seq
) fc ON cc.citing_patent_id = fc.patent_id
INNER JOIN PATENTSVIEW_CPC_SUBGROUP sg ON fc.subgroup_id = sg.id
GROUP BY ca.citing_assignee_organization, sg.title
ORDER BY citation_count DESC, ca.citing_assignee_organization, sg.title