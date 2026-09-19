# V8-B1 — Validation Evidence Promotion Foundation

## Scope and architecture findings

V8-B1 adds a deterministic preparation boundary between private Validation evidence and the Data Moat. It records decisions but deliberately performs **no** `problem_observations` write. Existing observations and classifications are append-only. Interview observations have exact session, participant, experiment-version, hypothesis-version, subject, and owner lineage. Survey answers remain separate immutable rows and are not Validation evidence observations.

The classification schema permits append-only supersession, identifies AI classifications as suggested-only, and prevents two successors for one predecessor. It does not prevent multiple independent roots. Therefore “current authoritative” means exactly one terminal, non-AI, authoritative node in the observation's supersession graph; zero is missing and multiple are safely deferred as ambiguous. Ordering by `created_at` or `classified_at` is never authority.

```text
Validation human evidence
        ↓
authoritative lineage
        ↓
eligibility policy
        ↓
independence
        ↓
canonical resolution
        ↓
representative selection
        ↓
promotion preparation ledger
        ↓
STOP — no problem_observations write in V8-B1
```

## Evidence and eligibility policy

Policy `v8-b1.2` accepts only immutable, non-empty Customer Interview observations created under the explicit `human_interview` / `interview_observation` / `customer_interview` contract and now also requires the authoritative experiment family to be `customer_interview`. The composite lineage must be valid; participant status must be active; the session must be in progress or completed; the experiment must be running, paused, or completed; and structured target relevance must be `target_segment_match`.

AI intelligence, synthesis, generated drafts, questions, copy, recommendations, interview notes, hypotheses, and arbitrary respondent prose are not evidence inputs. `ai_model_suggested` can never resolve as authoritative. This source boundary prevents the recursive human → AI summary → new “human” corroboration loop.

The current authoritative classifications `supporting`, `contradicting`, and `mixed` are equally promotable. `neutral` and `inconclusive` remain preserved but deferred.

Stable eligibility reasons are:

- `eligible`
- `missing_authoritative_classification`
- `ambiguous_authoritative_classification`
- `classification_not_promotable`
- `unsupported_evidence_origin`
- `missing_independence_identity`
- `empty_evidence_content`
- `invalid_validation_lineage`
- `experiment_state_not_eligible`
- `target_relevance_unproven`
- `participant_state_not_eligible`
- `survey_projection_required`

## Independence and representative selection

For interviews, the owner-private participant ID is the preparation independence unit. It never becomes a shared identity token. A later write-enabled PR must derive an opaque keyed token using an approved server secret; V8-B1 introduces no secret and materializes no shared token. For surveys, the submission/respondent—not each answer—is the independence unit.

Representatives group by `(private independence unit, canonical problem, polarity)`. Supporting, contradicting, and mixed remain separate. Exactly one winner is selected lexicographically, without a truth or confidence score:

1. structured specificity: commercial behavior, observed behavior, reported past behavior, workaround/resource allocation, frequency/severity, structured opinion;
2. established target relevance;
3. explicit direct quote over summary;
4. bounded content length;
5. recency;
6. stable observation ID.

Only factors already supplied as structured preparation fields are operational. The evaluator never infers specificity, authority, relevance, or quote status from prose. Source-quality ranking is reserved because the current contract cannot prove it consistently.

## Canonical resolution

Resolver `v8-b1-exact.1` is read-only. Precedence is:

1. explicit upstream canonical problem ID, when it identifies one active registry row;
2. exact normalized active canonical title using the shared Knowledge normalizer;
3. exact normalized active alias;
4. defer as unmatched or ambiguous.

Subject label precedes hypothesis problem claim as the explicit text identity. Respondent answer prose is never a resolution source. Similarity is intentionally not enabled: the existing generic similarity engine combines context and scoring inputs that this bounded Validation identity contract cannot safely provide. The resolver creates no canonical problem or alias and performs no mutation.

## Survey boundary

Raw survey answers receive `survey_projection_required`; they cannot silently enter this pipeline. The pure preparation contract can model multiple answers as one submission/respondent independence unit for boundary testing, but the V8-B1 database ledger is deliberately Customer-Interview-only and permits only participant independence. A narrow, separately reviewed Survey → `validation_evidence_observations` projection must extend the ledger additively after authoritative Survey observations exist.

## Private ledger, security, and history

`validation_evidence_promotions` is a server-private, RLS-enabled, append-only preparation ledger. `public`, `anon`, and `authenticated` receive no privileges or policies; only `service_role` has table privileges. There is no browser endpoint or generic mutation RPC.

Composite foreign keys preserve owner, observation, classification, participant, session, hypothesis, and experiment lineage. Supersession additionally references the same owner, observation, and policy version, so it cannot cross either an evidence boundary or a policy chain. One root and at most one direct successor produce a linear chain. The current preparation is its terminal row: the row not referenced as `supersedes_promotion_id` by another row in that chain. Timestamps never determine current state.

The evaluation snapshot records policy/resolver versions, stable decisions, private participant independence, representative state, optional resolved canonical identity, and an optional future `problem_observation_id`. A unique index with `NULLS NOT DISTINCT` makes the same observation/classification/policy evaluation idempotent, including deferred evaluations with no classification. A replacement authoritative classification creates a distinct successor row; a policy-version change starts a distinct chain. Old rows are never updated or deleted.

Database checks reject structurally impossible states: eligible rows require an authoritative classification and promotable polarity; selected representatives require eligibility and resolved canonical identity; and a future `problem_observation_id` additionally requires a selected eligible representative. The foreign key proves that a referenced Data Moat row exists, but V8-B1 does not attempt to enforce that row's canonical identity against the ledger because creating and validating that mapping belongs to the later transactional promotion-write contract.

## Explicit non-goals and next PR

V8-B1 does not promote evidence, derive shared identity tokens, project survey answers, add UI/API routes, call AI/embeddings/external APIs, create canonical identities/aliases, or update any Data Moat, aggregate, intelligence, evolution, opportunity, recommendation, Weekly, Scan, Discover, Dashboard, auth, or entitlement state. It does not alter B0.1–B0.2 code, migrations, activation data, or hashing.

Before a write-enabled PR, reviewers must inspect real preparation output, approve the survey boundary and opaque-token secret convention, add a narrowly authorized transactional preparation command, define controlled `problem_observations` mapping/idempotency, and retain the V8 stop before aggregate or intelligence updates.
