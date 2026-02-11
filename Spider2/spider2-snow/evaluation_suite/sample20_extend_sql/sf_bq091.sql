-- 问题：在专利类别'A61'中申请最多的受让人是哪一年申请最多？

-- 步骤1：统计包含A61类别的专利数量，按受让人分组
SELECT 
  `assignee`,
  COUNT(*) AS `patent_count`
FROM PATENTS_PATENTS_PUBLICATIONS 
WHERE `cpc` LIKE '%A61%' 
  AND `assignee` IS NOT NULL 
  AND `assignee` != '[]'
GROUP BY `assignee`
ORDER BY `patent_count` DESC
LIMIT 1;

-- 结果：Novartis Ag 在A61类别中申请最多，有100个专利申请

-- 步骤2：分析Novartis Ag在A61类别中各年份的申请数量
SELECT 
  CAST(SUBSTRING(CAST(`filing_date` AS STRING), 1, 4) AS INT) AS `year`,
  COUNT(*) AS `patent_count`
FROM PATENTS_PATENTS_PUBLICATIONS 
WHERE `cpc` LIKE '%A61%' 
  AND `assignee` LIKE '%Novartis Ag%'
  AND `filing_date` IS NOT NULL
  AND `filing_date` > 0
GROUP BY CAST(SUBSTRING(CAST(`filing_date` AS STRING), 1, 4) AS INT)
ORDER BY `patent_count` DESC
LIMIT 1;

-- 结果：Novartis Ag 在2006年申请最多，有11个专利申请

-- 最终答案：
-- 受让人：Novartis Ag
-- 专利类别：A61
-- 申请最多的年份：2006年
-- 该年份申请数量：11个