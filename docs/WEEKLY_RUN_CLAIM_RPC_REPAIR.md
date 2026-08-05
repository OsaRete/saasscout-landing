# Weekly Intelligence Run Claim RPC Repair

## Documents reviewed and architectural constraints

Reviewed in order: `AGENTS.md`, `docs/PRODUCT_VISION.md`, `docs/DATA_MOAT.md`, `docs/SYSTEM_ARCHITECTURE.md`, `docs/AI_PRINCIPLES.md`, `docs/ENGINE_GUIDELINES.md`, `docs/CODING_STANDARDS.md`, Weekly/Data Moat docs (`DATA_MOAT_AGGREGATION_LAYER.md`, `ENTRY_PATH_COMPATIBILITY_REPAIR.md`, `KNOWLEDGE_EVOLUTION_MIGRATION_PLAN.md`, `PRODUCTION_ENTRY_FLOW_VERIFICATION.md`), and the migration chain that creates or changes Weekly tables/RPCs.

Constraints: Weekly is an authoritative ingestion path. The claim boundary may reserve or reuse a parent run only; it must not collect sources, invoke providers, persist child problems/sources, mutate Problem Intelligence, or run Knowledge Evolution. Browser roles must not execute user-parameterized mutations. Completed reports are terminal and reusable. Failed or stale active reports may be reclaimed without deleting historical reports.

## Root cause

The repository-effective RPC created by `20260721000000_consolidate_weekly_intelligence_pipeline.sql` inserts with `ON CONFLICT (user_id, period_start, period_end) DO NOTHING`. The only repository uniqueness for that key is a partial unique index from `20260719010000_user_scoped_weekly_intelligence.sql`: `(user_id, period_start, period_end) WHERE user_id IS NOT NULL AND period_start IS NOT NULL AND period_end IS NOT NULL`. PostgreSQL cannot infer that partial index from an `ON CONFLICT` clause that omits the matching predicate, and production evidence also showed no visible user-period unique constraint. Therefore the no-existing-run case fails at the insert boundary with no usable arbiter for the conflict target.

The missing production unique index is also a latent integrity risk, but the direct failure is the RPC's unsupported `ON CONFLICT` target at the new-claim path.

## RPC contract matrix

| Layer | Expected contract | Actual repository contract before repair | Production evidence | Mismatch |
|---|---|---|---|---|
| Function identity | `public.claim_weekly_intelligence_run` | Created in `20260721000000` | Exists | None |
| Signature | `(uuid, timestamptz, timestamptz, text, timestamptz)` | Same | Visible UUID plus timestamptz parameters; repo has two additional parameters including text timezone and stale timestamptz | Production visible summary was incomplete, but service call matches repo |
| Return | `TABLE(claim_status text, run jsonb)` | Same | Same | None |
| TS arguments | Named `p_user_id`, `p_period_start`, `p_period_end`, `p_timezone`, `p_stale_before` | Same | Function accepts RPC | None |
| New claim | Create one `processing` parent and return `claimed` | Insert uses unsupported `ON CONFLICT (user_id, period_start, period_end)` | No current row, failure at `run_claimed` | Direct root cause |
| Existing completed | Return `completed` without mutating | Select then return `completed` | Not contradicted | None |
| Existing processing | Return `processing` if fresh | Select then return `processing` | Not contradicted | None |
| Existing claimed/failed/stale | Reclaim to `processing` | Reclaims any non-fresh non-completed status | Not contradicted | Contract implicit; repair keeps deterministic reclaim |
| Uniqueness | One parent per user-period under concurrency | Partial unique index exists in repo history but `ON CONFLICT` cannot use it; production did not show it | Missing production unique | Direct RPC bug plus drift/latent risk |
| NULL periods | Fail closed | Before repair accepts nulls through insert/select semantics | Production period is non-null | Latent malformed-input risk |
| Identifier resolution | Avoid output/table ambiguity | Before repair used unqualified columns with output parameter names `claim_status`, `run` but no table column named `run`; `status` only via row variable | Not contradicted | Low risk; repair fully aliases table references |
| JSON shape | Actual run JSON with `id`, ownership, period, timezone, status, totals | `to_jsonb(claimed)` | Production columns contain those fields | Compatible |
| Privileges | service_role only, SECURITY DEFINER, fixed search path | Hardened in `20260721010000` | Owner postgres, SECURITY DEFINER, service_role execute, search path includes public | No weakening required |

## Repair

Migration `20260805000000_repair_weekly_run_claim_contract.sql`:

1. Preflights duplicate non-null user-period rows and raises a clear deployment error instead of deleting or rewriting production rows.
2. Creates the partial unique index if it is absent.
3. Replaces the RPC to serialize by user-period with `pg_advisory_xact_lock`, then select/update/insert without relying on `ON CONFLICT`.
4. Validates malformed inputs and fails closed.
5. Keeps SECURITY DEFINER, `search_path = public`, and service-role-only execution.

## Concurrency and idempotency

The advisory transaction lock is keyed by user ID and UTC period, so two service-role calls for the same user-period serialize before reading or inserting. Calls for different users or different periods use different locks and can proceed independently. Completed rows are returned without mutation. Fresh processing rows return `processing`. Failed, claimed, or stale rows are reclaimed as `processing` without deleting parent or child rows during claim.

## Caller compatibility and diagnostics

The TypeScript repository call still invokes the same RPC with the same argument names. It now validates claim statuses and required run JSON fields before returning a claim to the service. RPC errors are logged server-side with the stable RPC name, PostgreSQL code, argument presence flags, weekly period key, and user ID. Public API responses remain sanitized.

## Data Moat preservation audit

After claim success, `runAuthoritativeWeeklyGenerationForUser` loads user-owned evidence through `collectWeeklyEvidenceFromDataMoat`, validates model output, calls `replaceProblems`, then `completeRun`. Weekly detected problems are persisted in `weekly_detected_problems` inside `replaceProblems`. Weekly source persistence remains a separate `persistWeeklySources` helper and is not invoked by claim alone. Problem Intelligence updates happen in `updateWeeklyProblemIntelligence` after child problem persistence. Knowledge Evolution diagnostics run from `runKnowledgeEvolutionWeeklyDiagnostics` only after problem persistence and only when diagnostics are enabled.

The RPC repair does not bypass, duplicate, or reorder these downstream writes. A reused completed report returns before aggregation/model/persistence, so it does not feed the Data Moat again. A concurrent duplicate receives `processing` or `completed`, so it cannot generate duplicate Weekly knowledge through the authoritative service. Source collection, prompts, provider behavior, scoring, deduplication, Knowledge Evolution semantics, production data cleanup, and historical rows remain outside this PR.

## Production preflight SQL

```sql
select pg_get_functiondef('public.claim_weekly_intelligence_run(uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone)'::regprocedure);
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as arguments, pg_get_function_result(p.oid) as result from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'claim_weekly_intelligence_run';
select r.rolname as owner, p.prosecdef as security_definer, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner where n.nspname = 'public' and p.proname = 'claim_weekly_intelligence_run';
select grantee, privilege_type from information_schema.routine_privileges where specific_schema = 'public' and routine_name = 'claim_weekly_intelligence_run' order by grantee, privilege_type;
select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'weekly_intelligence_runs' order by ordinal_position;
select conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.weekly_intelligence_runs'::regclass order by conname;
select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'weekly_intelligence_runs' order by indexname;
select user_id, period_start, period_end, count(*) from public.weekly_intelligence_runs where user_id is not null and period_start is not null and period_end is not null group by user_id, period_start, period_end having count(*) > 1 order by count(*) desc, period_start desc;
select id, user_id, period_start, period_end, status, created_at from public.weekly_intelligence_runs where user_id is null or period_start is null or period_end is null order by created_at desc limit 100;
select status, count(*) from public.weekly_intelligence_runs group by status order by status;
select id, user_id, period_start, period_end, status, created_at, updated_at from public.weekly_intelligence_runs where user_id = 'f9b25503-126c-45dd-ab9f-f16915f17832' and period_start = '2026-08-03T00:00:00.000Z'::timestamptz and period_end = '2026-08-10T00:00:00.000Z'::timestamptz order by created_at desc;
select version from supabase_migrations.schema_migrations where version in ('20260719010000','20260721000000','20260721010000','20260805000000') order by version;
```

## Deployment and verification order

1. Back up or snapshot `weekly_intelligence_runs`, `weekly_detected_problems`, and `weekly_sources`.
2. Run duplicate/null/status preflight SQL above.
3. Run `npx supabase db push --dry-run`.
4. Apply the migration only if the duplicate preflight is clean.
5. Verify migration history includes `20260805000000`.
6. Verify RPC definition, owner/security mode, search path, and grants.
7. Click the Weekly button once for the affected user.
8. Confirm logs proceed beyond `run_claimed`.
9. Confirm exactly one current-period parent row.
10. Confirm generation and downstream detected-problem/Problem Intelligence/Data Moat persistence.
11. Click again and confirm completed reuse.
12. Invoke cron safely and confirm no duplicate report.

## Rollback / forward-fix

Do not edit the applied migration. If repair deployment fails, disable new Weekly generation at the application boundary while preserving read-only access to historical reports and diagnostics. Do not widen browser privileges, delete current-period reports, disable Data Moat integrity checks, or mutate historical Weekly rows. Use a forward-fix migration after diagnosis.

## Remaining risks

If production already contains duplicate non-null user-period parent rows, the migration intentionally stops and requires a separately approved cleanup. Non-RPC writers with service-role table privileges could still bypass the claim contract; this PR does not redesign broader Weekly write ownership. The PostgreSQL test harness requires a disposable Supabase/PostgreSQL database with the effective migration chain already applied.
