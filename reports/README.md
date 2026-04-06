# RET1 production evidence (local only)

Place **real** `[triage.retirement_dispatch_v1]` log exports here after pulling them from production (Supabase Dashboard → Logs → filter function containing `triage`, message contains `triage.retirement_dispatch_v1`), or from your log pipeline export.

**Suggested filename:** `ret1-export-prod-YYYYMMDD.log`

**Rollup:**

```bash
node scripts/ret1_dispatch_metrics_rollup.mjs reports/ret1-export-prod-YYYYMMDD.log
```

**Git:** `*.log` files under `reports/` are ignored to reduce risk of committing PII. See [`docs/v3/RET2_PILOT_CANDIDATE_SELECTION.md`](../docs/v3/RET2_PILOT_CANDIDATE_SELECTION.md).
