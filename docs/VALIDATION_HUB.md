# Beta Validation Hub: navigation and guided onboarding

## Baseline and scope

Fresh task/branch from main `cec60bc92b393e4b3d80d49ceaf40adc869b50ea`, the
verified merge of PR #242. This is a presentation and workflow integration change,
not a continuation of that implementation. Read AGENTS.md's six foundation docs,
PRODUCT_ROADMAP, IDEA_VALIDATION_WORKSPACE/API, Interviews, Surveys, all four
newer method docs, private database repair, release/resource policy, Supabase
bearer auth/admin/ownership projections, default-off checklist, existing AppShell,
UI primitives and installed Next 16 navigation guidance before implementation.
The current Beta priority is six coherent private methods followed by integrated
Beta acceptance; historical two-method descriptions describe earlier increments.

The Output/UI layer makes founder research easier to start and revisit, supporting
the Feedback Moat without changing strategic architecture, evidence authority or
shared Data Moat promotion/consumption. No new AI, dependency, migration, server
endpoint, database contract, background work or production setting is introduced.

## Journeys and reuse

- Existing sidebar → `/validation`: introduction, three-step onboarding, six
  method cards, objective guidance, studies and factual experiment statuses.
- Choose an objective → fixed matching method and explanation. All alternatives
  remain visible. Unavailable matches are disclosed rather than replaced by a
  seemingly available recommendation. No model call or scoring occurs.
- Choose a method → focus the study chooser → open an existing study or create a
  new one. The allowlisted `method` query preference survives subject creation.
  Define a hypothesis first, then Create experiment preselects the chosen method.
- Owned Opportunity → existing Validate this opportunity action → verified-source
  subject creation → hypothesis → shared method chooser → existing experiment
  command. Study navigation links back to the source opportunity and Hub.
- Study → compact experiment index → existing lifecycle/content/preview/share/
  results panels. Lifecycle hints explain preparation, starting, pause and review.
  Original transitions and optimistic concurrency remain authoritative.

Reused: PageHeader, Badge, Button, Field, SelectInput, TextInput, TextArea,
EmptyState, ValidationPage, ContextNotice, BackLink, validationRequest bearer
wrapper, HypothesisForm, ExperimentForm, all six execution workspaces, refresh
coordinator, immutable-plan handoff and existing API projections/commands.
`methods.ts` is shared presentation metadata; MethodPicker is reused by the Hub
and experiment form. Neither is authorization. No method-specific authoring,
publication, results or contact-removal implementation is duplicated.

## Truthfulness, capability and privacy boundaries

Cards distinguish private setup from public collection. UI booleans still come
from the server layout's existing release policy. Disabled methods use native
disabled buttons. Forged/unknown method preferences cannot select an unavailable
method. The experiment form checks its selected method before sending the existing
command; server family, authentication, ownership, lifecycle and RPC checks are
unchanged. Missing capability metadata fails closed. No NEXT_PUBLIC admission
flag, local-storage preference or query parameter can grant access.

The entire layout remains unavailable by default, before private client content
mounts. No default-off Hub data request is needed. Participant routes and shell
exclusion are unchanged. Context remains provenance, not evidence. New copy
separates interest, raw feedback, unverified usability telemetry and nonbinding
commercial statements from verified demand or confirmed purchases. Interview
observations are labeled accurately; other methods retain their separate results.
No private records enter shared knowledge, promotion, qualified consumption or AI.

## Existing-contract limitations and remaining UX

The Hub endpoint returns at most 100 recent studies, counts and lifecycle labels;
it does not expose experiment identifiers, family details, participant aggregates
or results across all methods. The Hub explicitly labels this scope. It links to
the existing per-study experiment list rather than fetching every full workspace
or inventing a global results metric. No cross-study results or global response
count is claimed. Interview observation counts do not include survey answers,
waitlist contacts, prototype telemetry, MVP feedback or commercial interactions.

Older source selectors still require an owned reference unless opened from a
supported product entry. The existing Opportunity action fills it automatically.
The UI explains this; no new source search/backend selector is introduced.
Method-specific editors/results retain existing layouts and limits. No unified
results export, automatic interpretation, participant recruitment or verified
identity/purchase workflow exists. Contradictions require founder review.

## Accessibility and responsive approach

Native labeled selects/buttons and disabled semantics; explicit status/error
regions; visible focus rings on added navigation; semantic study/method sections;
keyboard-operable objective selection; focus moves to the study chooser after a
Hub method selection. No new animation. Responsive cards stack on small screens,
wrap statuses/actions and preserve the existing violet/cyan dark visual identity.
Browser checks cover narrow 320/390, tablet 768 and desktop 1280 widths. This is
basic accessibility verification, not a full WCAG or assistive-technology audit.

## Verification and release

Synthetic local API fixtures are not human evidence or live Auth/PostgREST tests.
The focused Node suite covers policy-to-card parity, invalid query preferences,
missing secrets, existing workspace/refresh, interviews, surveys and all four newer
methods. Playwright covers loading/empty/error recovery, sidebar, keyboard
objective selection, method preference handoff, all six experiment creation
payloads/consent defaults, opportunity provenance, restricted/default-off behavior
and overflow. CI reuses the existing Validation build/browser job, adds the Hub
suite and starts only local synthetic capability variants; no paid services.

Commands and actual outcomes are recorded in the PR. No remote Preview/Production
acceptance or database write is performed. No merge, deployment or activation is
authorized by this task. Before code-only merge, require final-SHA CI and the
existing VALIDATION_VERCEL_DEFAULT_OFF_CHECKLIST.md operational evidence, including
any automatic deployment implications. Before Beta activation, separately approve
capabilities, verify deployed migrations/repair, run isolated real two-owner
Supabase Auth/PostgREST and participant/consent/privacy/lifecycle acceptance, and
complete trusted-IP, retention/support and end-to-end Beta usability review per
method docs. Preview shares Production credentials and is not disposable.

Known inherited participant UX issue: PR #242's review
[identified a definitive submission-validation error that holds the original
Commercial Intent payload](https://github.com/OsaRete/saasscout-landing/pull/242#discussion_r4549505232).
The current catch path still retains the held payload, so a server-rejected email
may require reload instead of correction. This Hub PR does not continue or amend
that method implementation. Resolve and regression-test definitive-error recovery
separately before real Commercial Intent collection; preserve identical retries
when the persistence outcome is uncertain.

### Actual local results

- PASS: production build/application TypeScript; focused application/new-tests/
  browser TypeScript and final standalone browser-file TypeScript.
- PASS: full lint, zero errors/four existing unrelated warnings; final changed
  source lint clean; workflow YAML formatting and diff whitespace.
- PASS: 100 focused Node tests, zero failures/skips, across Hub policy/workspace,
  refresh, all six methods and Results integration.
- PASS: eight final-build Hub Chromium scenarios, zero failures/skips, plus two
  existing Commercial Intent owner/mobile-participant browser regressions on this
  implementation. Browser APIs/auth are synthetic, not live acceptance.
- PASS: viewport overflow at 320/390/768/1280, experiment forms at 320 and completed
  results at 390; desktop/mobile screenshots reviewed. Existing sidebar margin
  transitions settle before overflow assertions; no new animation introduced.
- PASS: six actual default-off core API requests: 503/private/no-store and fixed
  `validation_disabled`; unavailable pages issue no private Validation requests.
- NOT RUN: repository-wide TypeScript (known unrelated baseline test diagnostics),
  full product E2E, real Supabase two-owner/PostgREST, complete local migration
  reset or any remote Preview/Production acceptance. No DB/schema code changed.

Recommendation: conditional GO for default-off code-only merge after required
final-head CI and the existing operational release checklist; NO-GO for capability
activation until the separate acceptance/approval and inherited UX repair above.
