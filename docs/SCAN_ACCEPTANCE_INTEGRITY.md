# Status-aware Scan acceptance and execution claims

## Audit baseline (before `scan-acceptance@2`)

The live five-argument `accept_scan_request` implementation compared `(user_id,
market, audience, region, evidence)`, excluded uploaded content, and selected the
oldest match before its profile lock. Its exact matrix was:

| Stored matching status | Returned ID | Returned status | Quota | Server action |
|---|---|---|---|---|
| no match | new attempt | `pending` | +1 ordinary / +0 unlimited | unconditional `processing` update |
| `pending` | oldest match | fabricated `pending` | unchanged | unconditional `processing` update |
| `processing` | oldest match | fabricated `pending` | unchanged | unconditional `processing` update |
| `completed` | oldest match | fabricated `pending` | unchanged | unconditional `processing` update |
| `failed` | oldest match | fabricated `pending` | unchanged | unconditional `processing` update |

Later migrations successively restored service-role ownership and added the
database-owned internal-tester entitlement, but did not change this lifecycle
matrix. Result children remained non-idempotent, so concurrent/reopened execution
could append ambiguous knowledge.

## Domain and API contract

- A **Scan request** is normalized logical intent and evidence identified by an
  authoritative `scan-request@1` SHA-256 fingerprint.
- A **Scan attempt** is one immutable execution attempt and Scan ID. Attempts are
  numbered per `(user_id, request_fingerprint)`.
- A **duplicate request** has that same server-derived fingerprint.
- A **retry attempt** is a new ID whose `retry_of_scan_id` points to the immediately
  preceding failed attempt. A retry increments ordinary usage; refund/compensation
  behavior is intentionally unchanged. Unlimited testers remain unmetered.
- An **execution claim** is the atomic, service-role-only `pending -> processing`
  transition. `completed` and `failed` are terminal.

`accept_scan_request_v2` returns `accepted`, `scan_id`, `disposition`,
`existing_status`, `execution_claim_required`, `unlimited_entitlement_used`,
`rejection_code`, `attempt_number`, and `retry_of_scan_id`. The dispositions are:

| Latest match | Disposition | New attempt / quota | Claim required |
|---|---|---|---|
| none | `created` | yes / once | yes |
| `pending` | `reused_pending` | no / no | yes |
| `processing` | `already_processing` | no / no | no |
| `completed` | `already_completed` | no / no | no |
| `failed` | `retry_created` | yes / once | yes |
| limit reached for new/retry | `rejected_limit` | no / no | no |

The HTTP workflow continues only after a successful claim. Processing reuse is
`202`, completed reuse is `200` with `scanId`, and a lost claim is `409`. Limit
rejection remains `402`. No provider work runs for these controlled reuse cases.

## Fingerprint canonicalization

`scan-request@1` includes the authenticated user ID; normalized market, niche,
audience, region, description, and pasted evidence; SHA-256 digests of every
uploaded file's bytes; normalized external snippets; normalized authoritative
Discover context; and the contract version. Canonical strings are NFKC-normalized,
whitespace-collapsed, trimmed, and case-folded. Filenames and MIME labels are
excluded. The browser cannot supply the fingerprint: request parsing reads file
bytes first and server orchestration derives it before acceptance. Raw evidence is
never stored in the fingerprint column.

## Read-only migration preflight

Run against production before migration (these queries do not mutate data):

```sql
select status, count(*) from public.scan group by status order by status;
select status, count(*) from public.scan
where status is null or status not in ('pending','processing','completed','failed')
group by status order by status;
select user_id, coalesce(market,''), coalesce(audience,''), coalesce(region,''),
       coalesce(evidence,''), count(*)
from public.scan group by 1,2,3,4,5 having count(*) > 1 order by count(*) desc;
select user_id, market, audience, region, evidence, status, id, created_at
from public.scan where user_id = :user_id and coalesce(market,'') = coalesce(:market,'')
  and coalesce(audience,'') = coalesce(:audience,'')
  and coalesce(region,'') = coalesce(:region,'')
  and coalesce(evidence,'') = coalesce(:evidence,'') order by created_at, id;
select s.status, count(distinct s.id) scans,
       count(distinct ea.id) analyses, count(distinct o.id) opportunities
from public.scan s left join public.evidence_analysis ea on ea.scan_id = s.id
left join public.opportunities o on o.scan_id = s.id group by s.status order by s.status;
```

Unexpected historical statuses do not block deployment: the lifecycle constraint
is `NOT VALID`, so it enforces new writes without validating or rewriting old rows.

## Deployment, verification, and forward-fix

1. Run preflight and apply the additive migration. The legacy RPC remains compatible
   with the old server during rollout; both new RPCs are service-role-only.
2. Deploy `scan-acceptance@2` server code, then verify created, pending reuse,
   processing, completed, failed retry, ordinary quota, and unlimited behavior.
3. Verify two simultaneous claims yield exactly one `claimed=true`; inspect bounded
   operational logs by Scan ID/disposition, never evidence or filenames.
4. After rollout stability, remove the legacy RPC in a separate migration.

If rollout fails, disable `SCAN_SERVER_WORKFLOW_ENABLED` to stop new acceptance and
provider work while preserving Results reads. Forward-fix the additive function or
server code; do not restore status-blind reuse and do not drop identity columns.
No historical row is cleaned or rewritten by this change.

## PostgreSQL-backed test environment

Static contract tests always run. For database concurrency verification, start the
local Supabase stack, apply migrations to its disposable database, seed an auth user
and profile, and issue concurrent service-role calls to both v2 RPCs. Browser-role
calls must receive permission denial. Never point this test procedure at production.
