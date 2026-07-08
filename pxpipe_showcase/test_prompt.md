Read every JSONL file under pxpipe_showcase/corpus.

Use only those files. Treat tenant_state_update records as state mutations where the last update by timestamp wins. Treat decision records as additive ledger entries.

Return compact JSON with exactly these keys:
- final_tenant_state: tenant -> { owner, budget, service_anchor }
- region_decision_counts: region -> { approve, deny, review }
- top_three_services_by_budget: array of { service, budget }, descending
- high_budget_tenants: tenants whose final budget is at least 500000, sorted by tenant

Do not quote seq values, opaque note fragments, hashes, or any byte-exact identifiers. This test is about aggregate/state recovery from dense context, not OCR-perfect recall.
