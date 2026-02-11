# Spider 2.0 Text2SQL Benchmark - AI Agent Guidelines

## Project Overview

**Spider 2.0** is a large-scale Text-to-SQL benchmark for evaluating LLMs on real-world enterprise database workflows. The repository contains three main evaluation settings:

1. **Spider2-Lite**: Traditional text-to-SQL (SQLite, BigQuery, Snowflake) with prepared metadata
2. **Spider2-Snow**: Snowflake-only setting for SQL dialect consistency  
3. **Spider2-DBT**: Code Agent tasks using DuckDB (68 examples)

## Architecture & Data Flow

### Three-Tier Evaluation Pipeline
```
Input: JSONL examples → SQL Generation → Result Comparison → Metrics
```

**Key Files:**
- [Spider2 README](Spider2/README.md) - Project overview & leaderboard
- [Evaluation Suite](Spider2/spider2-snow/evaluation_suite/evaluate.py) - Core comparison logic
- [Gold Data](Spider2/spider2-snow/evaluation_suite/gold/) - Ground truth results

### Multi-Database Support Pattern
- **SQLite**: Local (downloaded from [drive](https://drive.usercontent.google.com/download?id=1coEVsCZq-Xvj9p2TnhBFoFTsY-UoYGmG))
- **Snowflake**: Shared account (requires registration via form in assets)
- **BigQuery**: User's own project (GCP credentials)

Evaluation scripts handle all three in parallel with credential files:
- `evaluation_suite/snowflake_credential.json` 
- `evaluation_suite/bigquery_credential.json`

## Critical Workflows

### 1. Local Evaluation (Most Common)
```bash
# Spider2-Snow evaluation
cd Spider2/spider2-snow/evaluation_suite
python evaluate.py --result_dir <your_sql_folder> --mode sql
```

Output: metrics in `log.txt`, cached DataFrames prevent re-execution

### 2. Agent-Based Benchmarking (Docker Required)
```bash
# Spider-Agent-Lite workflow
cd Spider2/methods/spider-agent-lite
python spider_agent_setup_lite.py  # One-time setup
export OPENAI_API_KEY=...
python run.py --model gpt-4o -s experiment_name
python get_spider2lite_submission_data.py --experiment_suffix gpt-4o-test1
```

### 3. Result Submission Format
SQL files organized by instance ID in folders:
```
result_folder/
  ├── bq001.sql
  ├── sf_local009.sql
  └── dbt_001.sql
```

Evaluation expects one SQL per file, evaluated against gold results in `gold/exec_result/` (CSV) or `gold/sql/` (SQL).

## Project-Specific Patterns

### Evaluation Logic (Critical)
[evaluate.py](Spider2/spider2-snow/evaluation_suite/evaluate.py) contains non-standard comparison:
- **Pandas table comparison** with tolerance (1e-2 for floats)
- **Multi-result handling** - accepts ANY matching gold result if multiple expected outputs
- **Condition columns** - can ignore specific columns in comparison
- **Order-invariant matching** - ignores row order by default
- **CSV caching** with `@lru_cache` - gold results loaded once per session

**Key function:** `compare_pandas_table(pred, gold, condition_cols=[], ignore_order=False)`

### Credential Management
All three database connectors (SQLite, BigQuery, Snowflake) require setup:
1. Copy credential templates from `evaluation_suite/` to working directory
2. BigQuery: JSON service account key
3. Snowflake: Plain text username/password in JSON
4. SQLite: Auto-loads from `resource/databases/spider2-localdb/`

### Threading & Performance
Evaluation uses `ThreadPoolExecutor` for concurrent SQL execution (Snowflake queries queued):
- Per-query timeout in seconds
- Global GB tracking to prevent warehouse overload
- Logging with thread safety locks (`TeeOutput` class)

## Code Organization

```
Spider2/
├── spider2-lite/        # Traditional text-to-SQL baselines
│   ├── baselines/       # DAIL-SQL, DIN-SQL, CodeS implementations
│   └── evaluation_suite/
├── spider2-snow/        # Snowflake-unified setting
│   └── evaluation_suite/
├── spider2-dbt/         # Code agent task (68 examples)
└── methods/
    ├── spider-agent-lite/   # Docker-based agent runner
    ├── spider-agent-snow/   # Snowflake variant
    └── spider-agent-dbt/    # DBT workflow agent
```

## Common Tasks & Implementation Notes

### Adding a New Baseline
1. Create method folder in `Spider2/methods/`
2. Implement result extraction to match [format](Spider2/spider2-lite/evaluation_suite/#folder-structure)
3. Use evaluation suite's `evaluate.py` without modification
4. Follow credential pattern from [spider-agent-lite](Spider2/methods/spider-agent-lite/spider_agent_setup_lite.py)

### Debugging Failed Evals
- Check `log.txt` for timeout/connection errors
- Verify credential files exist and are valid JSON
- For Snowflake: See [Snowflake Guideline](Spider2/assets/Snowflake_Guideline.md) (MFA/password changes)
- SQL parsing errors log to `debug.log` in `logs/` directory

### Extending Evaluation Metrics
Current metrics: Exact Match (EM), Execution Match (EX)
- Modify comparison functions in [evaluate.py](Spider2/spider2-snow/evaluation_suite/evaluate.py#L100-L150)
- Add CSV readers to `load_gold_csv()` if changing gold format
- Test with `--mode exec_result` first (faster than SQL re-execution)

## Dependencies & Environment

- **Python**: 3.9+
- **Core**: snowflake-connector-python, google-cloud-bigquery, pandas, sqlparse
- **Execution**: pyspark (3.4.1) for some baselines
- **Agent frameworks**: LangChain in spider-agent implementations
- **.venv setup**: Already configured in repo, activate with `.venv/Scripts/Activate.ps1`

## Important Caveats

1. **Snowflake Cost**: Free tier has query queue delays; consider oracle-tables mode (pre-computed results)
2. **Gold Data**: SQL is sparsely provided; use execution-match mode for evaluation
3. **Data Updates**: Check [Data Update Log](https://docs.google.com/document/d/1a69mxO7m1nMndXp8H_-aggvYDbcbiS3rV9GPXEw-DeM/edit) for example changes
4. **Submission**: Official leaderboard requires form submission; see [Submission Guidance](https://docs.google.com/document/d/1sCobAqJZcko-Vl3biOycwvCIR7kTwBPrhsgVfvaX1Fg/edit)
