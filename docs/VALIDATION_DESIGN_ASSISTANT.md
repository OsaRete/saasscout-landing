# V7.1 — AI-Assisted Validation Design

V7.1 is a small, ephemeral design-assistance layer over the existing Validation
authoring workflow. It improves the founder's ability to formulate a hypothesis
or choose and prepare one supported experiment family. It does not redesign or
replace the V3, V5, or V6 authoritative commands.

## Authority and evidence boundary

AI output is a draft, not human evidence, an observation, a participant response,
a commercial signal, a validation verdict, or Data Moat knowledge. Generation
does not write any Validation record, promote any Data Moat record, create an
experiment, save a plan, publish a survey, or change an experiment lifecycle.

The draft remains browser-local. The founder must explicitly choose **Use this
draft**, may edit the populated compatible fields, and must then use the existing
save/create action. Suggested fields without an existing authoritative destination
remain explanatory guidance. No AI draft-history table or migration is introduced.

## Generation and credit controls

The browser calls the authenticated endpoint only from **Improve with AI** or
**Design experiment with AI**. Page load, render, focus, navigation, typing,
selection, save, refresh, and evidence changes never generate a draft. Duplicate
submission is disabled while generation is pending.

Each explicit generation performs at most one OpenRouter provider request with
`openai/gpt-5.1`. There is no retry, fallback model, repair pass, critique pass, or
automatic regeneration. The output budget is 1,600 completion tokens: enough for
one compact hypothesis or a 5–8 question experiment draft while remaining
materially below the broader V7 analysis budget.

## Output and security contract

The endpoint authenticates the user, derives ownership from the authenticated
identity, and owner-scopes both the subject and (for experiment mode) hypothesis
version before generation. It accepts only the two bounded modes and rejects
unknown/authoritative fields, malformed IDs, oversized text, and browser-selected
provider, model, or prompt instructions.

Founder text is serialized as untrusted user-message data, separate from the
server-owned design rules. OpenRouter receives a mode-specific, strict provider
JSON Schema. The server then parses JSON and applies its own exact-key, enum,
length, question-count, survey-type, and semantic-choice validation before
projecting the draft to the browser.

Experiment drafts recommend exactly one currently authoritative Beta family:
`customer_interview` or `survey`. They contain 5–8 behavioral, non-leading
questions designed around the most important evidence gap and allow negative
evidence to contradict the hypothesis. Survey choice questions require meaningful
respondent-facing labels and use only existing V6 question types.

# V7.2 temporary plan handoff

After a founder explicitly applies an experiment design draft and explicitly
creates its experiment shell, the already-generated questions are retained only
in the mounted validation workspace's React state. The handoff is bound to the
subject, hypothesis version, experiment, experiment version, and recommended
family returned by the authoritative creation command. A mismatch is ignored;
refreshing or leaving the workspace discards the handoff.

The matching Interview or Survey plan editor offers an optional **Use AI
suggested questions** action. Applying or dismissing the suggestions consumes
the temporary handoff. Applying changes editable local question state only and
makes no model or persistence request. Existing client validation and the V5/V6
**Save immutable plan** server command remain the sole route to an authoritative
plan version. Existing meaningful question content requires an explicit
replacement confirmation.

Successful explicit generation announces **AI draft ready**, then performs one
bounded smooth scroll and focus move to the new draft panel. Pending and failure
states are announced locally. Rendering, applying, saving, and navigation never
trigger this completion movement or an additional generation.
