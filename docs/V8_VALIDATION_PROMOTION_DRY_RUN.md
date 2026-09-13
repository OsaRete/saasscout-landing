# V8-B2 Validation promotion dry run

## Purpose and boundary

V8-B2 prepares an operator-private, deterministic view of persisted Validation evidence for human review. It performs no promotion and exposes no route or browser interface. Its only database boundary is the service-role `SELECT` repository; there is no apply command, RPC, ledger mutation, Data Moat mutation, model call, embedding call, or external evidence provider.

This preparation strengthens the Intelligence Moat by making the existing V8-B1 policy auditable against real data without weakening the Data Moat with an unreviewed association.

## Persisted shapes and repository scope

The Validation schema stores evidence, classifications, and lineage separately. The adapter therefore joins in memory by immutable IDs: observation; subject label/context; hypothesis-version problem claim; experiment-version family/lifecycle; participant status; interview-session status/relevance; and append-only classifications/supersession. The Canonical Registry read is limited to active-status resolution inputs: IDs, titles, normalized titles, and normalized aliases.

The projections deliberately omit participant names, emails, pseudonymous references, session notes, survey answers/tokens, classification rationales, source references, auth data, model material, and unrelated product data. No schema blocker or migration is required.

## Evaluation

The orchestration reuses policy `v8-b1.1`, including terminal authoritative classification resolution by supersession graph rather than timestamps. AI-suggested rows cannot establish authority. It reports every V8-B1 reason, including the Survey projection boundary, and treats supporting, contradicting, and mixed symmetrically.

Only eligible observations enter resolver `v8-b1-exact.1`. Resolution uses upstream canonical ID, then subject label, then hypothesis claim only when the label is absent; title and alias matching remain exact and normalized. Respondent prose is never an identity input. Unmatched, ambiguous, and insufficient identities remain deferred.

Resolved observations are grouped by private participant ID, canonical problem ID, and polarity. V8-B1 lexicographic representative selection picks at most one member per group. The report does not emit participant IDs or group keys: it emits ordered, report-local group references that are not a shared identity contract. It emits content metadata, not observation prose or raw notes.

## Determinism and reconciliation

The semantic report is code-point ordered. Its SHA-256 `promotionPreparationSnapshotHash` covers policy/resolver versions, eligibility/classification outcomes, canonical outcomes, and representative outcomes. It excludes `generatedAt`, retrieval order, and local paths.

Before writing the local JSON file, the CLI fails closed unless evaluated observations reconcile to eligible plus deferred, eligible evidence reconciles to canonical-resolved plus canonical-deferred, and resolved evidence reconciles to representatives plus non-representatives. It also verifies representative/group uniqueness and absence of selected/deferred overlap.

Run locally with:

```sh
npm run validation-promotion:dry-run
```

The ignored artifact is written to `artifacts/validation-promotion-dry-run.json`. Running this command reads the configured database; it cannot promote evidence.

**NO PRODUCTION PROMOTION IS PERFORMED BY V8-B2.** Its successful state is only **READY FOR DRY-RUN REVIEW**; a human must review real production output before separately approved V8-B3 work.
