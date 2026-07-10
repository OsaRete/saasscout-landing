# Snapshot Storage Identity and Conflict Policy

## Purpose

This document freezes the provider-neutral storage identity and replay policy for Snapshot conceptual storage before the first Supabase SQL migration. It does not introduce SQL, migrations, database clients, production persistence activation, API behavior, UI behavior, Discovery workflow integration, Knowledge Evolution execution, Memory, Learning, or Recommendation behavior.

The policy hardens the Data Moat by ensuring historical Snapshot records are immutable, deterministic, idempotent, and safe to replay without losing evidence lineage.

## Canonical identity principles

Every storage identity must be:

- deterministic;
- independent of input array position;
- independent of insertion order;
- independent of database-generated business identity;
- independent of provider execution order;
- derived only from canonical stable fields in the validated Snapshot contract and persistence boundary.

Database-generated physical row identifiers may exist later as infrastructure implementation details, but they must never become business identity or canonical replay identity.

## Canonical semantic key material by record kind

| Storage group | Canonical semantic key material |
| --- | --- |
| Snapshot identity | `discoveryId`, `snapshotId`, `contractVersion`, `idempotencyKey` |
| Snapshot section | Snapshot identity plus canonical section name |
| Evidence | Snapshot identity plus `evidenceId` |
| Evidence support | Snapshot identity plus `evidenceId`, support `section`, optional `field`, optional `targetId`, optional `rationale` |
| Provenance source | Snapshot identity plus `sourceId` |
| Evidence lineage | Snapshot identity plus `evidenceId` |
| Engine attribution | Snapshot identity plus `engineName`, `engineVersion`, canonical attributed `section` |
| Processing history | Snapshot identity plus `step`, optional `completedAt`, optional `version` |
| Validation | Snapshot identity plus the singleton `validation` record kind |

Equivalent records may be sorted for deterministic output, but ordering is not identity. If future contract fields are added to a child record, identity may only include fields that are stable, canonical, provider-neutral, and part of the conceptual Snapshot contract.

## Repository replay and conflict semantics

Repository writes have four deterministic outcomes:

- `inserted`: no existing mapping exists for the repository identity, so the immutable mapping is accepted for the first time.
- `replayed_identical`: the same repository identity is written again with identical canonical content. This is a successful idempotent outcome and must not overwrite or duplicate stored records.
- `rejected_conflict`: the same repository identity is written again with different canonical content. This is a deterministic conflict and must never overwrite historical data.
- `failed`: infrastructure, validation, availability, or boundary failures that prevent deterministic acceptance or rejection.

The repository boundary remains database-agnostic. Future physical repositories must implement these semantics atomically.

## Atomicity and partial-write conflict behavior

A Snapshot storage mapping is the minimum atomic write unit. A repository implementation must either persist the complete mapping or persist none of it.

If any child record conflicts with existing immutable content under the same identity, the complete write must be rejected as `rejected_conflict`. Partial success is forbidden. Conflicting replay must never replace existing identity, section, evidence, provenance, processing, attribution, or validation records.

## Version storage policy

The storage layer must preserve version fields in a way that supports compatibility checks and historical interpretation:

| Version | First-class storage column? | Retained in full versions object? | Reason |
| --- | --- | --- | --- |
| `snapshotVersion` | Yes, on Snapshot identity | Yes, through Snapshot metadata/identity payload | Identity-layer traceability |
| `contractVersion` | Yes, on all records and mapping identity | Yes, in `versions.snapshotContract` | Compatibility and repository lookup |
| `engineVersion` | Yes for engine attribution records; top-level engine version may be indexed from `versions.engine` | Yes | Engine provenance and historical interpretation |
| `intelligenceVersion` | Yes on Snapshot identity when physically implemented | Yes | Intelligence contract compatibility |
| `normalizationVersion` | Yes on Snapshot identity when present | Yes | Normalization interpretation |
| `confidenceVersion` | Yes on Snapshot identity when present | Yes | Confidence calibration interpretation |

The full `versions` object must also be retained on the Snapshot identity record so future readers can reconstruct historical contract semantics even if first-class indexed columns evolve.

## Section uniqueness policy

Required conceptual sections must have exactly one section record per Snapshot:

- `discovery_context`
- `problem_intelligence`
- `opportunity_intelligence`
- `confidence`
- `diagnostics`

`founder_intelligence` is optional and must have zero or one section record. Duplicate section records are forbidden, including duplicate optional founder intelligence records.

## Validation persistence metadata

Validation persistence is owned by the Snapshot Validator. The validator must publish a deterministic `validatorVersion`, and persistence must retain:

- `valid`;
- `validatorVersion`;
- `summary`;
- `errors`;
- `warnings`;
- deterministic diagnostics relevant to validation decisions.

For accepted Snapshot persistence inputs, `valid` is `true` and `errors` is expected to be empty, but the field remains part of the persisted validation contract so all validator outcomes have a stable shape.

## Production behavior

This policy only hardens conceptual storage mapping, repository boundary semantics, and documentation. Production persistence remains inactive until a later approved infrastructure PR supplies a database implementation that conforms to this policy.
