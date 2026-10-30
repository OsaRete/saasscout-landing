# V8 B4.3-B — Current Evidence Safety Foundation

**Status:** Restrictive safety boundary; not a permission issuer or active product consumer.

This migration implements the approved [B4.3-A authority contract](./V8_B43_A_CURRENT_EVIDENCE_AUTHORITY_CONTRACT.md). Historical qualification, immutable proof integrity, and current consumption eligibility remain separate. B3.1 promotion rows and B4.2 snapshots are not rewritten.

## Persisted safety facts

`validation_evidence_consumption_authority` binds the fixed purpose `qualified_validation_shared_evidence` to the exact promotion, owner, source observation, canonical UUID, promotion fingerprint, and projection version. Its only permitted state is `withheld`. An `AFTER INSERT` trigger on genuinely new promotions writes this row in the same transaction; failure aborts promotion. Existing promotions receive no authority row or backfill. Authority facts are immutable.

`validation_evidence_source_restrictions` is a private append-only ledger. Source triggers append facts in the source mutation transaction for participant withdrawal/archive, consent metadata change, session cancellation/relevance loss, experiment cancellation, promoted-classification supersession, and canonical deactivation/merge. Participant restrictions are contribution-observation scoped: restored participant status never removes a fact, and evidence first observed after restoration does not inherit an earlier restriction. An observation inserted while a participant is withdrawn or archived receives its own restriction. Experiment completion alone adds none. No shared-use revocation issuer or positive authority writer is exposed.

## Read boundary

`validation_b43_read_current_evidence(uuid)` accepts only the persisted canonical UUID and fixes purpose internally. It is a bounded, complete, `STABLE` PostgreSQL assessment, using the calling statement's snapshot for candidate discovery, proof verification, lineage/current-source checks, classifications, authority, restrictions, and canonical state. It rejects more than 100 candidates and fails the whole request on missing authority, unsupported/corrupt B4.2 proof, identity disagreement, invalid source state, or ambiguous authoritative classification terminals. It does not use title, alias, or merge-target fallback.

Because B4.3-B can issue only `WITHHELD`, valid candidates are excluded and the result is currently empty. A missing authority row is an error, not an empty result. No consumer activation or fallback to the historical reader is wired. The server-only TypeScript wrapper accepts/returns only sanitized allowlisted fields and maps failures to a generic error. No private lineage, respondent details, consent metadata/text, restriction reasons, or internal counts are returned.

## Database boundary

Private facts have forced RLS and no direct `service_role` access. Non-login, non-inheriting, non-bypass roles own the narrow security-definer trigger/read functions. The current reader RPC is executable by `service_role` only; trigger functions have no caller execution grant. Functions use schema-qualified objects and fixed search paths. The schema CREATE grant used during function ownership transfer is revoked in the migration transaction.

Source-change lock hooks reuse the B3.1 participant, experiment, and session lock ordering. Restriction insert failure aborts the initiating transaction. The canonical restriction trigger runs after the existing statement-level registry lock hook. This migration does not claim protection against a database/schema administrator who can replace the enforcement objects.

## Verification and limitations

The disposable integration suite is opt-in and requires the fixed local Supabase API/database endpoints, an explicit `VALIDATION_B43_DISPOSABLE=1`, and a fresh fixture database. It must not be run against existing local data or production. CI runs it only after its own disposable local database reset. The test script is not permission to start/reset local Supabase or execute migrations in an interactive environment.

No positive authority, authority restoration, shared-use revocation issuer, externally exposed revocation operation, owner-withdrawal endpoint, historical backfill, survey promotion, scoring, AI call, Knowledge Evolution integration, or downstream consumer activation is included.
