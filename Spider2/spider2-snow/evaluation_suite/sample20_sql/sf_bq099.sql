-- 专利类别A01B3顶级申请人分析
-- 数据源：PATENTS_PATENTS数据库

-- 步骤1：获取A01B3类别专利的申请人年份统计
SELECT 
    REPLACE(a.value::VARCHAR, '"', '') AS assignee_name,
    YEAR(DATEADD('day', p."publication_date", '1970-01-01')) AS publication_year,
    p."country_code",
    COUNT(DISTINCT p."application_number") AS applications_count
FROM PATENTS.PUBLICATIONS p,
LATERAL FLATTEN(input => PARSE_JSON(p."assignee")) a,
LATERAL FLATTEN(input => PARSE_JSON(p."cpc")) cpc
WHERE cpc.value:"code"::VARCHAR LIKE 'A01B3%'
AND p."publication_date" IS NOT NULL
AND a.value IS NOT NULL
GROUP BY REPLACE(a.value::VARCHAR, '"', ''), YEAR(DATEADD('day', p."publication_date", '1970-01-01')), p."country_code"
ORDER BY assignee_name, applications_count DESC;

-- 步骤2：分析每个申请人的年份统计（使用窗口函数）
SELECT 
    ys.ASSIGNEE_NAME,
    ys.PUBLICATION_YEAR,
    ys.country_code,
    ys.APPLICATIONS_COUNT,
    SUM(APPLICATIONS_COUNT) OVER (PARTITION BY ASSIGNEE_NAME) AS total_applications,
    ROW_NUMBER() OVER (PARTITION BY ASSIGNEE_NAME ORDER BY ys.APPLICATIONS_COUNT DESC, ys.PUBLICATION_YEAR DESC) as year_rank
FROM yearly_stats ys
ORDER BY total_applications DESC, ASSIGNEE_NAME, year_rank;

-- 步骤3：获取前3名申请人的完整信息
SELECT 
    aya.ASSIGNEE_NAME,
    aya.total_applications,
    aya.PUBLICATION_YEAR AS max_applications_year,
    aya.APPLICATIONS_COUNT AS applications_in_max_year,
    aya.country_code AS country_code_in_max_year
FROM assignee_year_analysis aya
WHERE aya.year_rank = 1
ORDER BY aya.total_applications DESC, aya.ASSIGNEE_NAME
LIMIT 3;

-- 最终结果：
-- 1. Lely Nv C Van Der - 总申请数: 5, 最多年份: -9135, 该年份申请数: 1, 国家代码: NL
-- 2. Amazonen Werke Dreyer H - 总申请数: 2, 最多年份: -9299, 该年份申请数: 1, 国家代码: GB
-- 3. Deere & Company - 总申请数: 2, 最多年份: -8261, 该年份申请数: 1, 国家代码: EP