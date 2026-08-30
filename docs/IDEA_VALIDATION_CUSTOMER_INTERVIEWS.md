# Customer Interview Validation (V5)

## Purpose and boundary

V5 makes a Customer Interview experiment a private research workflow. A real person's reported behavior is the evidence source; SaaSScout does not conduct, recruit for, record, transcribe, or interpret the call. Discover, Scan, Weekly, Saved Ideas, Opportunities, Evidence Alignment, and AI output remain context—not Validation evidence. V5 records no verdict, score, confidence, Data Moat promotion, or Knowledge Evolution write.

## Architecture and session decision

The V2/V3 model could attach several observations to a participant and experiment version, but could not distinguish two interviews with the same person, model draft/completed work, or preserve which revised question plan a session used. V5 therefore adds the smallest explicit execution layer: immutable `validation_interview_plan_versions`, lifecycle-controlled `validation_interview_sessions`, and an optional, exact session foreign key on observations. Participant and session are deliberately different entities.

Every session fixes the owner-scoped participant, experiment version, hypothesis version, and interview-plan version. Its lifecycle is `draft → in_progress → completed`, with cancellation from either non-terminal state. A completed/cancelled session and its lineage cannot be rewritten. A draft interview can start only while its exact customer-interview experiment version is `running`; the start command locks that exact parent row, serializing with the V3 lifecycle update before it re-checks the state. `Paused`, `completed`, and `cancelled` experiments cannot begin a new interview. An interview that was already in progress may still be completed or cancelled after its parent pauses or becomes terminal so that real human evidence and an accurate session outcome are not lost. Experiment lifecycle never changes the validity or preservation of evidence already captured.

## Plans and minimum interaction

Plans are append-only versions tied to an exact customer-interview experiment version. Revising creates a successor; existing sessions retain their old plan ID. Plans accept 1–12 bounded questions, while the editor recommends 5–8 and starts with eight deterministic, editable behavioral prompts. Guidance asks about past behavior, one question at a time, and warns against pitching or compliments. There is no model call.

## Participants and privacy

The UI exposes anonymous, experiment-pseudonymous, owner-pseudonymous, and identified-interview modes already approved by V1–V3. No email, phone, social handle, legal name, CRM, contact enrichment, or sensitive profile is required. A short optional research alias stays bounded. Relevance is a user-recorded factual context label (`target_segment_match`, `adjacent_segment`, or `unknown_relevance`), never a quality score and never an automatic rejection.

## Notes, observations, provenance, and classifications

Session notes are bounded private working text. Broad subject projections return session metadata but not notes. Authenticated direct-table access is restricted to an explicit safe session-metadata column list that excludes both `notes` and `owner_id`; owner RLS still scopes those rows. The server-only service role retains note access for the narrow session command. Notes are never logged, parsed, classified, or converted to evidence automatically. The user explicitly records an observation through the server-owned V3-style append command.

Interview observations have exact experiment/hypothesis/participant/session lineage, database collection time, user-supplied observed time, `human_interview` origin, `interview_observation` modality, owner-scoped idempotency, and a bounded content object containing category, statement kind, and content. `direct_quote` means only verbatim text entered by the user; `summary` is explicitly distinct. Negative, contradictory, mixed, neutral, and inconclusive material is preserved. Optional polarity uses the existing append-only classification command; corrections append successors rather than changing evidence. Session completion means the conversation ended; the user may still organize that conversation into immutable structured observations afterward. A later parent experiment completion or cancellation does not erase or invalidate those observations and cannot authorize a new interview.

Several observations in one session keep one participant/session provenance and therefore do not become independent respondents. The first observation for a participant remains `unknown`; later observations in that known participant cluster use the existing `repeat_participant` relationship. Here `repeat_participant` means the observation is related to prior evidence from the same participant, not that the participant necessarily completed another interview. Exact participant and session IDs remain the authoritative grouping even under concurrency. Identical content from different participants remains representable because idempotency is per ingestion key and content is not globally deduplicated.

## Security and deferred work

All commands authenticate first, derive `owner_id` server-side, verify ownership, and only then use server-only service-role authority. New tables have RLS, owner-only authenticated reads, no authenticated mutations, explicit service-role grants, restrictive composite foreign keys, and immutable-history triggers. Notes and observation bodies are not operationally logged. There is no public ingress, participant link, webhook, outreach, AI response generation, automatic extraction, survey workflow (V6), interpretation (V7), promotion, meeting, recording, or transcription infrastructure.
