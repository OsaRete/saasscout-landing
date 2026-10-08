# B4.2-B1 integrity boundary — B4.2-C corrections

## Baseline and scope

Correction branch: `codex/b42-b1-integrity`, existing draft PR #216. The local branch and GitHub PR both matched the reviewed full HEAD `8f4fdba86a9b43d59e4b9eab5be452c9971add3d` with a clean working tree before edits. Original implementation baseline: `fe5f4fd5b8e15d7be88500068eb9618e2c07ed24`. B4.1 reader and B3.1 promotion migration were inspected locally. The original B3.1 migration remains unchanged.

This report supersedes the earlier historical-exclusion and selected-field snapshot claims. Scope remains newly promoted qualified human evidence, atomic private attestations, scoped shared-row immutability and the server-only reader. No historical backfill, canonical lifecycle change, correction/withdrawal, Knowledge Evolution consumer or legacy ingestion redesign.

## Qualification before integrity; historical compatibility

The reader first checks the supported B3.1 immutable ledger contract and its exact sorted-key SHA-256 fingerprint. Demonstrably nonqualified/unsupported ledger records are excluded, including unsupported policy/resolver/projection, nonfinal state, invalid fingerprint, missing eligibility or representative authority. A shared-only marker cannot establish qualification.

Once a final ledger satisfies that contract, its integrity proof is mandatory. Missing shared rows or snapshots, ambiguous embeds, unsupported attestation versions, native full-row mismatch, invalid public fields or inconsistent snapshot linkage cause the entire read to throw `trusted_qualified_evidence_read_failed`. Errors carry no cause or private values; the reader does not log. Left shared embedding prevents SQL joins from concealing qualified candidates. Exact count checks occur before qualification: omitted, inconsistent or truncated results are non-consumable.

Historical qualifying promotions with no snapshot now fail a historical-only or mixed read, rather than returning an empty or partial supposedly complete result. Existing version-1 snapshots are retained but deliberately unsupported by the version-2 reader. They are not upgraded or re-attested. B3.1 exact duplicate exits are unchanged and create no missing attestations. Historical/unattested shared rows retain existing mutation behavior. This availability consequence is intentional fail-closed behavior and needs release review; this PR provides no historical remediation workflow.

Successful observations still expose exactly: `id`, `canonical_problem_id`, `problem_title`, `source_evidence`, `source_type`, `evidence_polarity`, `observed_at`, `projection_version`. Supporting, contradicting and mixed polarities remain intact.

## Actual persisted whole-row contract

Additive migration `20261008010000_qualified_evidence_snapshot_v2.sql` preserves the original migration and historical rows. New promotions insert an attestation after the existing shared and ledger inserts in the same transaction, selecting the actual persisted `problem_observations` row. Defaults and trigger changes are captured. An inability to create the complete version-2 attestation rolls the entire promotion back.

`v8-b4.2-b1-full-row.2` explicitly covers all 31 persisted columns protected by the existing whole-row UPDATE/DELETE guard: identity/canonical/fingerprint, title/normalized title/summary, source table/row/URL/type/evidence/author/metrics, niches/cluster, all nine numeric scores, evidence quality, observed/ingested/created/updated timestamps, metadata and polarity. `protected_schema` records their ordered names and PostgreSQL types. New or changed columns fail closed and require a reviewed new contract version; coverage is not narrowed automatically.

`protected_record` uses PostgreSQL's native composite text codec with fixed UTC and ISO date settings. Decoding to the explicit table row type and native `IS NOT DISTINCT FROM` compares the full row, preserving SQL NULL versus empty text versus JSON null, exact JSONB/numeric values, array dimensions/lower bounds and timestamp microseconds. JavaScript does not serialize or compare this record. The invoker-rights, STABLE computed field `validation_b42_snapshot_verified` returns only a boolean in the same PostgREST SELECT snapshot. Malformed codecs return false without exposing PostgreSQL parsing errors. The public application projection remains eight fields.

The codec is tied to this ordered PostgreSQL schema. Future DDL must deliberately update the versioned contract. No added typed snapshot-table column blocks ordinary shared-table migration; drift instead causes reads and new attestations to fail closed until reviewed.

## Privileges and concurrency

Existing ledger and snapshot runtime privileges remain SELECT-only for `service_role`; direct INSERT/UPDATE/DELETE/TRUNCATE are denied. Browser `anon` and `authenticated` roles have no private proof read/write grants and no promotion execution grants. Shared table grants are unchanged. The SECURITY DEFINER shared-row guard, owned by postgres, rejects any UPDATE/DELETE only when a snapshot attests that row. Inbound FKs and private TRUNCATE revocations prevent runtime shared CASCADE/TRUNCATE bypass. Snapshot UPDATE/DELETE immutability remains enforced. Read-only version-2 helpers revoke PUBLIC/anon/authenticated execution and grant service_role execution; they are invoker-rights, not privileged writers.

B3.1 lock ordering, qualification, authority freshness and uniqueness remain unchanged: canonical coordination, sorted experiments, participant then representative group; competing exact promotions serialize, with one new result and existing duplicate exits. Snapshot creation is inside that existing critical section and transaction. No new lock ordering or retry policy is introduced. Tests compare both replacement RPC bodies to the original B3.1 body after removing only the atomic snapshot block.

## Service-role trust boundary (explicit limitation)

`app/api/validation/promotions/route.ts` uses the authenticated Validation handler, obtains the user identity from `requireUser` and delegates through `ValidationService.promoteInterviewEvidence`. The service accepts an observation ID and rejects caller-supplied authority fields. The server-only `promoteCustomerInterviewEvidence` prepares the owner-scoped persisted corpus, performs representative ranking and exact canonical resolution in TypeScript, and computes the fingerprint before calling the RPC. No browser-supplied owner, representative or canonical choice is forwarded as trusted authority.

`validation_promote_customer_interview_evidence` is postgres-owned SECURITY DEFINER with its existing fixed search path. PUBLIC, anon and authenticated execution are revoked; service_role execution is granted. Database administrators/owner retain administrative authority. Ordinary holders of the service-role credential can call this RPC directly with independently supplied observation/classification/canonical/group/fingerprint and current representative/authority snapshots. PostgreSQL independently checks supported versions/polarity, owner-scoped source lineage, human classification, experiment/session/participant criteria, approved shareable statement, current full participant state, current canonical/alias authority snapshot, active selected canonical/title, locks and uniqueness. It does **not** independently perform the TypeScript representative ranking, exact canonical selection or fingerprint recomputation. Equality to current state proves freshness, not correct interpretation of that state.

The disposable suite deliberately demonstrates service-role selection of an otherwise active canonical that the TypeScript exact resolver would not choose, while browser/authenticated direct calls are denied. This is an existing trusted application credential assumption, not a newly enforced database guarantee. No unauthorized browser invocation path was found in the inspected route/service/grants. A compromised service-role credential can bypass trusted preparation and fabricate semantic qualification through the allowed promotion RPC despite being unable to directly fabricate ledger/snapshot rows. A snapshot attests persisted integrity, not the correctness of a malicious trusted caller's selection. Database owners can also disable guards or alter proofs. Eliminating these risks requires separately approved B3.1 authorization/qualification architecture and is outside this correction.

## Verification record

Execution evidence and workflow run IDs will be appended after testing the correction SHA. Mandatory database tests must run against a fresh fixed-loopback disposable Supabase database; the runner fails rather than skips missing prerequisites. No production/staging execution or `supabase db push` is authorized. Merge remains NO-GO until real mandatory suites pass and a new independent security review approves the corrected boundary.
