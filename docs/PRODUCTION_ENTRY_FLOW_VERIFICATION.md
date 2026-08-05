# Production Entry Flow Verification

## Root-cause matrix

| Flow | Exact failing boundary | Confirmed cause | Safe repair | Migration required? |
| --- | --- | --- | --- | --- |
| Manual Scan | Visible form state → multipart `intent`/`legacyContext` contract → `/api/scan/workflow` request validation | The active manual page had local field state for `market`, `audience`, and `region`, but FormData construction was not backed by a shared contract and always appended an optional `legacyContext` object, even when empty. Production payloads could therefore arrive as `intent: {}` and `legacyContext: {}` while the file field was present, causing strict evidence request validation to fail before Scan acceptance. | Add a shared manual Scan contract for canonical intent normalization, supported file rules, file field name, and non-empty legacy context omission. The browser now serializes the normalized visible values and only appends meaningful optional context. Server multipart validation continues to use `getAll("files")` and rejects malformed files before acceptance. | No |
| Discover | Discover route error boundary → browser message | The route collapsed all workflow boundaries into generic strings, so production could not distinguish auth/profile/source/provider/parse/persistence/zero-result states. Repository diagnosis did not prove a quality-rule or quota defect. | Preserve the existing workflow and add typed safe public envelopes and aggregate diagnostics at the route boundary so technical failures and valid zero results are distinguishable without logging content or secrets. | No |
| Weekly Intelligence | Button/cron response boundary and cron authorization diagnostics | Button and cron both call `runWeeklyGenerationForUser`, which delegates to `runAuthoritativeWeeklyGenerationForUser`; however public responses were generic and cron configuration/authorization errors were not typed. The cron schedule is configured at `/api/cron` for `0 8 * * 1` (Monday 08:00 UTC). | Preserve the single authoritative service, return typed sanitized codes for auth/capability/reuse/processing/failure, and keep cron on bearer `CRON_SECRET` with safe per-user results. | No |

## Data Moat writes

Manual Scan writes an accepted Scan attempt through the status-aware acceptance contract, persists canonical evidence analysis and generated opportunities after the authoritative workflow completes, and optionally runs artifact shadow persistence when enabled. Discover writes an opportunity discovery parent, discovered problems, Problem Intelligence updates, and Knowledge Evolution dual writes when active. Weekly writes one user-period weekly report, child weekly detected problems, and Problem Intelligence/Data Moat updates through the authoritative weekly repository.

## Production verification

### Manual Scan
1. Open `/scan`, enter only market/audience/region, and verify the button remains disabled and no network request to `/api/scan/workflow` is made.
2. Paste at least 20 useful evidence characters and submit. In DevTools, confirm `intent` contains non-empty `market`, `audience`, and `region` values.
3. Upload a non-empty `.txt`, `.pdf`, and `.docx` separately. Confirm FormData contains `files` and a non-empty `intent` object.
4. Upload a zero-byte file and an unsupported extension; verify local rejection and no Scan row/quota mutation.
5. Upload a file over 5 MB; verify local rejection.
6. Confirm a successful Scan creates one accepted row and completed child analysis/opportunity records.

### Discover
1. Click Run Discovery and inspect the JSON response code if the UI reports an issue.
2. Treat `discover_zero_results` as a successful zero-result outcome, not a technical outage.
3. Check server logs for aggregate counts only: source counts, model outcome, candidate counts, dedup counts, persistence stage, and degraded flag.
4. Prepare Deep Scan from a result and confirm Scan quota is not consumed until `/api/scan/workflow` accepts the prepared scan.

### Weekly
1. Click Run Weekly Intelligence and confirm the response is success, processing, reused, or a typed safe error.
2. Click again for the same period and verify the completed current-period report is reused without duplicate reports or children.
3. Manually invoke `/api/cron` with `Authorization: Bearer <CRON_SECRET>` to verify cron behavior without waiting for Monday.
4. Confirm Vercel cron remains `/api/cron` at `0 8 * * 1` (Monday 08:00 UTC).
5. Confirm logs contain no source contents, prompts, model responses, tokens, emails, or secret values.

## Environment audit

Required variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `CRON_SECRET`, and `NEXT_PUBLIC_SITE_URL`. Optional active source variables: `SERPAPI_API_KEY`, `X_BEARER_TOKEN`. `WEEKLY_REPORT_OWNER_ID` is not used by the current repository path; recipient selection is user-scoped from `user_profiles.weekly_intelligence_enabled`.

## Rollback and forward-fix

Rollback by reverting the PR commit. Forward-fix remaining Phase 1 risk in a separate P0 PR: accepted-but-failed Scan quota accounting. Do not change quota semantics in this repair.
