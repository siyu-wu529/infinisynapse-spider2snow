# 项目索引（根目录）

> 根目录下现有目录与文件的用途索引。

---

## 目录

| 目录 | 说明 |
|------|------|
| **.github/** | GitHub 相关（如 copilot-instructions.md） |
| **docs/** | 项目文档，仅 SPIDER2_GATEWAY_CLIENT.md |
| **Infinisql Generator/** | SQL 生成与评测，主入口 |
| **Spider2/** | Spider2 官方数据集与评测 |
| **tools/** | infinisynapse-tools，仅 snowflake_connector |

---

## 根目录文件

| 文件 | 说明 |
|------|------|
| **README.md** | 项目总览与快速开始 |
| **FOLDER_STRUCTURE.md** | 目录结构说明 |
| **PROJECT_INDEX.md** | 本文件，根目录索引 |
| **requirements.txt** | 可选 Python 依赖（如 Spider2 评测等） |
| **.gitignore** | Git 忽略规则（*.log、.env、temp/、.cursor/ 等） |

---

## 常用入口

- **生成 SQL**：`cd "Infinisql Generator"` → 见该目录 `README.md`
- **查结构**：`FOLDER_STRUCTURE.md`
- **查依赖**：`Infinisql Generator/DEPENDENCIES.md`
- **Gateway 使用**：`docs/SPIDER2_GATEWAY_CLIENT.md`
