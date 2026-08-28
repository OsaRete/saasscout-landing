# Idea Validation Domain Contract (V1)

## Product definition and boundary

Idea Validation asks: **What do real people and observable behavior tell us about this idea?** Its flow is `explicit hypothesis -> experiment -> human or behavioral observation -> classification/interpretation -> evidence state -> recommended next experiment`.

This differs from the existing **Evidence Alignment** compatibility implementation in `lib/idea-validation/`, which asks what SaaSScout already knows that supports or contradicts an idea. Discover, Scan, Weekly, Saved Idea, Opportunity, Snapshot, and Evidence Alignment outputs can provide typed upstream context; they are never human evidence or behavioral observations.

V1 defines pure TypeScript semantics only in `lib/validation/`. It neither integrates with nor changes Evidence Alignment.

## Domain entities

- A **Validation Subject** is an owner-scoped concept with an immutable context snapshot and optional typed upstream reference. It supports Discover, Scan, Weekly, Saved Idea, Opportunity, and user-entered origins without copying upstream prose into evidence.
- A **Hypothesis** identifies its subject and immutable version. It requires a bounded target segment, problem claim, expected observable behavior, optional commercial assumption, explicit support/contradiction/inconclusive criteria, inclusions/exclusions, and lifecycle status.
- An **Experiment** tests exactly one hypothesis version. Contract families are `customer_interview`, `survey`, `landing_waitlist`, and `social_validation_post`; only interviews and surveys are Beta execution scope. The latter two reserve compatible semantics but have no execution contracts.
- A **Participant Reference** is separate from evidence and may be absent for anonymous observations. Relevance inputs are attributed individually rather than collapsed into a score.
- A **Validation Observation** binds subject, hypothesis version, experiment version, participant reference, source provenance, timestamps, modality, normalized observation, polarity, independence metadata, and classification provenance. It is a conceptual immutable record, not a table design.
- A **Derived Interpretation** references observation identifiers and stays separate from observations.

## Hypothesis testability and versioning

Deterministic validation rejects missing/bare segments, missing observable behavior, missing outcome criteria, and generic success predictions such as “This app will succeed.” It does not claim that prose quality proves the hypothesis.

A change to target segment, problem claim, expected behavior, commercial assumption, any outcome-criteria set, or scope is material and requires a new version. Comparison normalizes case, surrounding/repeated whitespace, and list order so formatting does not create false versions. Prior versions are superseded, never rewritten.

## Experiment lifecycle and versioning

Lifecycle and visibility are orthogonal; archive is a visibility choice rather than an execution state.

| From | Allowed next states |
| --- | --- |
| `draft` | `ready`, `cancelled` |
| `ready` | `draft`, `running`, `cancelled` |
| `running` | `paused`, `completed`, `cancelled` |
| `paused` | `running`, `completed`, `cancelled` |
| `completed` | none |
| `cancelled` | none |

Returning `ready -> draft` supports correction before evidence collection. Paused work may complete when collection has ended. Completed/cancelled experiments are terminal and cannot silently reopen.

Changes to family/method, target audience, question set, screening criteria, collection method, CTA, or pricing are material. They require a new experiment version. Formatting and list order are non-material. Completed experiment definitions remain immutable; continuation is a new version/experiment.

## Participant relevance, privacy, and independence

Identity modes are anonymous, experiment-local pseudonymous, owner-local pseudonymous, identified interview participant, email waitlist lead, social source, and manually imported respondent. Relevance factors cover target-segment match, direct experience, role, company/context, problem exposure, frequency, workaround, and commercial exposure. Every input identifies whether it was participant supplied, user supplied, deterministic, AI suggested, or server observed. There is no truth score.

PII is minimized by default. Anonymous/pseudonymous references are preferred; protected contact references are optional and only for an explicit feature. Participant identity is separate from market observation, as is consent/purpose metadata. No cross-user participant correlation is permitted, and future Data Moat promotion must exclude raw PII.

Independence metadata distinguishes content fingerprint, ingestion idempotency key, participant independence key, duplicate import, repeated participant, independent evidence, and unknown independence. Anonymous evidence explicitly preserves independence uncertainty. These are supplied concepts; V1 performs no hashing and never treats repeated/imported observations as automatic corroboration.

## Evidence taxonomy and polarity

Human origins are general human response, interview, survey, social response, and manual human observation. Behavioral origin is an actual server/manual behavioral observation. Observable behavioral event types are page view, CTA click, form start, signup submission, demo request, pricing interaction, completed deposit, and completed purchase. “Behavioral intent” is a future derived dimension—not a raw event.

Modalities preserve opinion, reported behavior, observed behavior, commercial signal, structured/free-text response, interview observation, survey answer, social response, and conversion event.

Polarity is `supporting`, `contradicting`, `mixed`, `neutral`, or `inconclusive`. It is classification against explicit hypothesis criteria. Positive sentiment is not automatically support; negative sentiment is not automatically contradiction. Corrections append classification provenance and supersede the prior classification without rewriting raw evidence.

## Interpretation and evidence-state vocabulary

Deterministic and AI/model interpretations are derived. They may suggest themes, polarity, segment relevance, summaries, contradiction explanations, next experiments, or narratives, but must reference observations. They cannot create responses, conversions, or willingness-to-pay proof and cannot overwrite raw evidence.

Future dimensions are problem evidence, target-segment relevance, problem frequency/severity, current-workaround evidence, solution interest, behavioral intent, commercial evidence, willingness to pay, contradiction strength, and evidence coverage/limitations. No computation is implemented.

The non-numeric evidence-state vocabulary is `insufficient`, `limited`, `mixed`, `moderate`, `strong`, and `contradicted`. Dimension-specific applicability may be narrowed in V2; V1 deliberately avoids premature matrices. Overall narrative states are `insufficient_evidence`, `problem_signal_emerging`, `mixed_or_segment_dependent`, `promising_behavioral_evidence_incomplete`, `promising_commercial_evidence_incomplete`, `materially_contradicted`, and `ready_for_next_stage_commitment_review`. They are non-predictive and never claim an idea is validated, guaranteed, or a proven winner.

## Beta experiment contracts and minimum interaction

Customer Interviews bind a testable hypothesis version to participant criteria, question identifiers/intents, optional bias-risk metadata, consent/privacy mode, and manual capture. Surveys bind a testable hypothesis to respondent criteria and typed questions with screening and support/contradiction/inconclusive/context relationships, compatible with manual or imported responses.

Validators reject empty criteria and empty/malformed question sets. V1 imposes no arbitrary maximum: “minimum interaction necessary” is a design principle, while an evidence-based maximum remains a V2 product decision.

## Immutability and Data Moat boundary

Raw observations, source payload/reference, and completed experiments are immutable. Material edits create versions; supersession is append-only. Classification corrections supersede classifications, never raw evidence.

The conservative eligibility helper only says a human or actual behavioral origin *may* qualify for future reviewed promotion. Upstream context, deterministic/AI interpretation, summaries, and user intent are ineligible. V1 performs no Data Moat or Knowledge Evolution write and defines no promotion workflow.

## V1 non-goals and V2 expectations

There are no tables, migrations, RLS/grant changes, repositories, Supabase calls, APIs, UI, execution/hosting, CSV parsing, ingress, emails, prompts/model calls, scoring, canonicalization, flags, or persistence. V2 must separately decide persistence mapping, authorization and retention, protected contact handling, payload limits, version commands, classification review, deduplication algorithms, dimension applicability, execution ingress, and reviewed Data Moat promotion. Those decisions must preserve this evidence/context boundary.
