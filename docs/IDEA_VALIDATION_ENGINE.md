# Evidence Alignment Engine (compatibility path: Idea Validation)

> **Product contract:** the active system documented at this legacy file path is **Evidence Alignment**, not real-world Idea Validation. The `docs/IDEA_VALIDATION_ENGINE.md` path, `lib/idea-validation/` modules, internal types and functions, and `POST /api/results/idea-validation` route are retained only for compatibility. New product-facing copy must call the active system **Evidence Alignment**.

## Terminology boundary

**Evidence Alignment** answers:

> What does SaaSScout already know that supports or contradicts this idea?

It measures how strongly an idea aligns with market intelligence SaaSScout already has. It is internal, deterministic corroboration against existing user-owned SaaSScout and Data Moat records. **Evidence Alignment is not real-world customer validation**, and it does not answer whether real customers will want an idea.

**Idea Validation** is reserved for the future real-world Validation domain. That system will answer:

> What do real people and observable behavior tell us about this idea?

The future domain may include explicit hypotheses, experiment lifecycles, customer interviews, surveys, landing-page or waitlist behavior, social validation responses, positive and negative human evidence, participant relevance, provenance, multidimensional results, and controlled Data Moat promotion. None of those capabilities are implemented by this V0 semantic reframe.

The architectural flows are distinct:

- Evidence Alignment: `existing intelligence -> deterministic corroboration`
- Future Idea Validation: `hypothesis -> experiment -> real human/behavioral evidence`

## Presentation mapping

Internal status values and the API contract remain unchanged. Results maps them at the presentation boundary so internal corroboration is not overstated:

| Internal status | Product-facing Evidence Alignment label |
| --- | --- |
| `validated` | Strong alignment |
| `promising` | Moderate alignment |
| `weak` | Weak alignment |
| `contradicted` | Contradictory evidence |
| `insufficient_evidence` | Insufficient internal evidence |

The internal recommendation `prioritize_beta_validation` is likewise presented as **Prioritize customer research**. It does not assert that customer validation has occurred.

## Evidence sources and exclusions

Evidence Alignment reads normalized, existing user-owned records exposed by `aggregateUserDataMoat()`, including completed Scan output, generated opportunities, Discover history and accepted problems, saved ideas, Weekly reports, snapshots, and historical user evidence. Shared Problem Intelligence can be supplementary server context where explicitly requested, but the Results integration excludes it and remains user-scoped.

Its result is derived/internal intelligence. Renaming the presentation does not turn the result into a new evidence origin. In particular, the engine receives no new evidence from:

- customer interviews;
- surveys;
- waitlist or landing-page behavior;
- social responses;
- real-world experiment participants.

Evidence Alignment may later provide hypothesis context, experiment-prioritization context, and supporting or contradictory internal context to Idea Validation. It must never be counted as human validation, behavioral validation, willingness to pay, or direct market-validation evidence.

## Active architecture

Results builds a bounded batch of existing opportunities and calls `POST /api/results/idea-validation`. The authenticated route validates the complete request envelope, performs exactly one request-local `aggregateUserDataMoat(userId)` call, builds an immutable context with `buildIdeaValidationDataMoatContext()`, and evaluates accepted ideas with `validateIdeaAgainstDataMoatContext()`.

The deterministic engine evaluates related mentions, normalized source diversity, recurrence across UTC month windows, freshness, bounded signal strength, supporting evidence, and contradictory or rejected evidence. Confidence weights, thresholds, matching, contradiction logic, recommendations, and response fields are unchanged by the Evidence Alignment terminology decision.

The route limit remains `RESULTS_IDEA_VALIDATION_MAX_IDEAS = 30`. Oversized input is rejected, malformed or empty accepted input avoids aggregation, and duplicate stable IDs reuse their first deterministic result. Public results remain `{ validations: Record<string, PublicIdeaValidationResponse> }`; internal aggregation and evaluation diagnostics are stripped.

## Read-only AI and Data Moat boundary

The engine is a read-side deterministic module. It does not insert, update, delete, upsert, persist outcomes, modify Problem Intelligence, activate Data Moat learning, compute embeddings, or call an LLM/model/provider. Request-local reuse preserves user isolation and evidence freshness; no global or cross-request cache is added.

Evidence Alignment therefore makes no Data Moat write and introduces no schema, migration, RLS, grant, authentication, or authorization change.

## Compatibility and non-goals

The legacy/internal names below remain stable to avoid breaking callers:

- `POST /api/results/idea-validation`;
- `lib/idea-validation/`;
- `lib/results/idea-validation-*`;
- existing `IdeaValidation*` exported identifiers, status enums, recommendation enums, and response fields.

No duplicate endpoint is introduced. No future Validation route, workspace, sidebar item, hypothesis/experiment/respondent model, or database table exists as part of V0. Scan, Discover, Weekly, Saved Ideas, Opportunities persistence, Results business logic, Data Moat aggregation, Knowledge Evolution, authentication, authorization, RLS, grants, and database behavior remain outside this semantic/presentation change.
