# Weekly Intelligence Beta-readiness architecture review

## Exact execution chain and ownership

| Stage | Owner / function | Input → output | Persistence / Data Moat effect | Reuse |
|---|---|---|---|---|
| Button | `WeeklyPage.handleRunWeeklyIntelligence` | Auth token → POST result | None | Reloads server projection |
| API + authentication | `POST` / `requireUser` | Bearer token → authenticated user | None | Same boundary for every click |
| Claim | `runAuthoritativeWeeklyGenerationForUser` / `claimRun` / `claim_weekly_intelligence_run` | user + Monday UTC period → claimed, processing, completed, or reclaimed run | One `weekly_intelligence_runs` parent | Completed and processing return before collection/model/writes |
| Data Moat collection | `collectWeeklyEvidenceFromDataMoat` / `aggregateUserDataMoat` | authenticated user → current evidence, prior context, shared aggregates | Read only | Skipped on reuse |
| Model generation | `analyzeUserScopedWeeklySignals` | explicitly separated evidence classes → structured candidate observations | None; provider output is not authoritative | Skipped on reuse and empty evidence |
| Validation + scoring | `validateWeeklyModelOutput` / `calculateWeeklyProblemScores` | candidate fields + owned evidence IDs → grounded problem and deterministic scores | Rejects unknown/missing references; optional unsupported fields become null | Skipped on reuse |
| Persistence | `replaceProblems`, then `completeRun` | normalized unique-title problems → children and completed parent | `weekly_detected_problems`, reviewed `problem_intelligence`, optional Knowledge Evolution diagnostics; no placeholder writes | Completed parent cannot be replaced; reuse performs no writes |
| Projection | authenticated `GET /api/weekly-intelligence` | user and optional run ID → safe owned runs/problems/external references/taxonomy | Server-owned reads only | Reused report projects existing rows |
| Problem Intelligence | `updateWeeklyProblemIntelligence` | only problems with evidence-derived pain/revenue/urgency scores | Reviewed aggregate write; incomplete scores do not become canonical aggregates | Only during first successful persistence |
| Knowledge Evolution | `runKnowledgeEvolutionWeeklyDiagnostics` | persisted grounded problems | Diagnostic assessment when explicitly enabled | Only during first successful persistence |
| Prepare Deep Scan | `WeeklyPage` evidence payload | Weekly ID, title, summary, niche, evidence summary/IDs, investigation, external references, Data Moat context | No Weekly mutation; provenance travels in the Scan preparation payload | Same stable payload on reuse |
| UI | `WeeklyPage` | authenticated server projection → evidence, insights, recommendations, confidence | None | Displays stored report |

## Root-cause and placeholder matrix

| Value | Previous origin | Classification | Repair |
|---|---|---|---|
| `Untitled weekly pattern` | `validateWeeklyModelOutput` title fallback | Persistence fallback; fabricated | Title is required or validation fails |
| `User explored market` | `validateWeeklyModelOutput` niche fallback | Persistence fallback; fabricated | Unsupported niche remains null and is hidden |
| `Validation follow-up` | `validateWeeklyModelOutput` solution fallback | Persistence fallback; fabricated | Unsupported recommendation remains null and is hidden |
| `Validate willingness to pay before building.` | `validateWeeklyModelOutput` monetization fallback | Persistence fallback; fabricated | Unsupported monetization remains null and is hidden |
| `5/10` | `clamp` default | Validation/persistence fallback; fabricated | Missing dimensions remain null |
| Average Intelligence | client weighted average including fallback values | UI projection | Average uses only persisted deterministic intelligence scores; absent scores show an em dash |
| Pain / Urgency / Revenue / Trend | provider fields passed through `clamp` | Provider-generated and normalized | Provider numeric values are ignored; the server computes them from referenced evidence |
| Untitled/no snippet/unknown text | Weekly UI/source payload fallbacks | UI fallback | Empty optional presentation is hidden or rendered without invented content |

## Deterministic score methodology

Weekly accepts only evidence IDs from eligible, user-owned current-period aggregation. Unknown references reject the complete model output. Pain, urgency, and revenue each start from a conservative evidence baseline of 2 and add two points per explicit dimension-specific signal term, capped at 10. Trend is null for a single observation; with repeated referenced observations it increases deterministically by repetition, with one continuity point only when prior user context exists. Confidence increases with the number of matched references and independent evidence types. Evidence strength is `limited` for one reference, `moderate` for at least two, and `strong` only for at least four references spanning at least two types. Overall Intelligence is the arithmetic mean only when at least two dimensions are measurable. Average Intelligence is the mean of non-null overall scores only.

This is intentionally conservative: missing evidence produces null, sparse evidence lowers confidence, and model-proposed numbers are ignored.

## Source taxonomy

* **External sources:** safe fields from server-owned `weekly_sources`; public market references only.
* **User-owned Data Moat evidence:** stable evidence IDs referenced by a problem; content stays within the owned Weekly projection/Deep Scan contract.
* **Weekly evidence:** persisted detected problems for the owned report.
* **Derived observations:** repeated-pattern and business-impact interpretations, clearly separate from raw evidence.
* **AI-generated insights:** validated problem synthesis. These become authoritative only after reference validation and deterministic scoring.

## Security and Data Moat integrity

The browser performs no direct `weekly_sources`, `weekly_intelligence_runs`, or `weekly_detected_problems` reads. The authenticated GET route derives the user from the bearer token, filters parents by `user_id`, then loads children only for those parent IDs through the service role and returns an allowlisted projection. `weekly_sources` remains unavailable to `anon` and `authenticated`; the additive migration explicitly preserves that boundary.

Authoritative writes are: the claim RPC creates/reclaims the parent; `replaceProblems` writes unique normalized child problems and then reviewed Problem Intelligence/optional Knowledge Evolution; `completeRun` finalizes summary and evidence count. A completed claim returns before every downstream write. No historical row is updated by the migration, no cleanup runs, and new structured fields remain nullable. The additive migration is necessary because the previous table had no columns for evidence references, confidence, affected users, observed evidence, repeated patterns, impact, tool failure, MVP, or recommended validation/investigation; encoding these in prose would destroy provenance and queryability.
