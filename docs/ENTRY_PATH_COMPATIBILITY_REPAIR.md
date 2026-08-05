# Entry Path Compatibility Repair

## Root-cause matrix

| Flow | failing boundary | exact cause | authoritative fix | migration needed? |
| --- | --- | --- | --- | --- |
| Manual Scan | Client preflight → `/api/scan/workflow` evidence ingestion | The page allowed intent-only submissions while the authoritative Scan workflow requires at least one useful evidence source. Intent and legacy Discover context are not independent evidence, so the server correctly rejected the request before acceptance. | Make manual Scan explicitly evidence-required in the UI, block client submission before any acceptance/quota mutation, omit empty optional fields, and continue using `/api/scan/workflow` for successful requests. | No |
| Discover Deep Scan | Evidence ingestion | Discover passes prepared evidence (`pastedEvidence`, `externalSnippets`, or `discoverContext`) plus optional legacy linkage, so it already satisfies the authoritative boundary. | Preserve the working request shape and keep legacy IDs/context as compatibility linkage only. | No |
| Weekly button | Authoritative Weekly lifecycle | The route already used the authoritative service, but operational diagnostics and terminal run protection were not sufficient to distinguish idempotent reuse, generation, validation, and persistence outcomes safely. | Keep the button on `/api/weekly-intelligence`, add safe diagnostics, protect completed reports from problem replacement/failure marking, and return controlled JSON. | No |
| Weekly schedule | Cron route → shared Weekly service | The Vercel cron entry exists and runs Monday at `08:00 UTC`, but the route returned raw per-user errors and lacked safe diagnostics for configuration, authorization, and per-recipient outcomes. | Keep `/api/cron` on the same `runWeeklyGenerationForUser` service, sanitize failures, document UTC scheduling, and make retries rely on the existing user-period claim RPC. | No |

## Product contract

Manual Scan is evidence-required for this repair. Market, audience, and region are trusted user intent used to frame the analysis, but they are not independent evidence. A successful manual Scan must include either pasted evidence with at least 20 useful characters or a supported uploaded file (`.txt`, `.pdf`, `.docx`, maximum 5 MB per file). Intent-only Scan remains rejected before Scan acceptance; the browser must not fabricate evidence or submit authoritative evidence metadata.

Discover-initiated Deep Scan remains evidence-backed because Discover prepares server-reviewed problem evidence and sends legacy problem/discovery IDs only as compatibility linkage for Results rows.

## Weekly scope and scheduling

The authenticated button and scheduled route both call the same authoritative Weekly generation service. Ordinary users read and generate only their own reports. The scheduler selects recipients from `user_profiles` where `weekly_intelligence_enabled = true`; this is the server-owned recipient policy and does not use email addresses or browser identity. `WEEKLY_REPORT_OWNER_ID` is not part of the active user-scoped Weekly path.

`vercel.json` configures `/api/cron` with `0 8 * * 1`, which means every Monday at 08:00 UTC. Weekly periods are UTC Monday `[start,end)` boundaries.

## Data Moat writes

Successful Manual and Discover Scans write through the existing Scan acceptance, execution claim, workflow, Results compatibility persistence, and optional artifact shadow boundaries. Rejected manual preflight does not create a Scan attempt, quota mutation, Scan row, evidence analysis, opportunity row, or artifact.

Successful Weekly generation writes only through the authoritative Weekly service: it claims/reuses one `weekly_intelligence_runs` row per user-period, persists `weekly_detected_problems`, and updates the reviewed problem-intelligence path. Weekly failures are marked failed only when the run is not already completed and do not persist fabricated fallback content.

## Production verification plan

Manual:
1. Submit pasted-evidence Scan and verify one completed `scan` row plus expected `evidence_analysis` and `opportunities` children.
2. Submit uploaded-file Scan with TXT/PDF/DOCX and verify the same persistence boundaries.
3. Submit intent-only Scan and confirm the UI blocks submission; verify no new `scan` row for that user/time window.

Discover:
1. Run a new Discovery.
2. Prepare Deep Scan.
3. Complete Scan and verify Results still show three opportunities linked to the source problem/discovery IDs.

Weekly button:
1. POST `/api/weekly-intelligence` as the authenticated user.
2. Confirm `weekly_intelligence_runs.user_id`, `period_start`, `period_end`, and `status` are correct.
3. Re-run and confirm the same current-period report is reused or reported as processing without duplicate completed reports.

Weekly automatic:
1. Manually invoke `/api/cron` with `Authorization: Bearer $CRON_SECRET`.
2. Confirm recipient selection comes from enabled `user_profiles` only.
3. Confirm idempotency by invoking it again for the same period.
4. Confirm `vercel.json` still contains the Monday UTC cron entry.

## Useful verification SQL

```sql
select id, user_id, status, request_fingerprint, created_at
from scan
where user_id = '<user-id>'
order by created_at desc
limit 10;

select user_id, period_start, period_end, timezone, status, count(*)
from weekly_intelligence_runs
group by user_id, period_start, period_end, timezone, status
order by period_start desc;
```

## Rollback and forward-fix

Rollback this PR if manual evidence-backed Scan or Weekly generation regresses. Forward-fix should preserve the same authoritative boundaries rather than restoring legacy/browser-owned writes. The known remaining P0 is that Scan quota is still charged at acceptance for post-acceptance failures; quota reservation/refund semantics are intentionally excluded and should be handled in the next dedicated PR.
