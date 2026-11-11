# PR 1: owner verification before an automatic Vercel deployment

This is an owner-executable verification checklist, not evidence that Vercel
settings have been inspected. No deployment or settings change was performed.
Repository `vercel.json` defines only the existing weekly `/api/cron` schedule;
it does not establish a Vercel project ID, production branch or capability values.
No linked `.vercel/project.json` is present in this task workspace. Git integration
and environment scopes must be verified in the authoritative Vercel project.

## Configuration capable of admission

| Server variable | Exact value | Admission |
| --- | --- | --- |
| `VALIDATION_PRIVATE_MODE` | `INTERVIEWS` | Private interviews and common subject/hypothesis operations |
| `VALIDATION_PRIVATE_MODE` | `SURVEYS` | Private survey authoring/revocation and common operations |
| `VALIDATION_PRIVATE_MODE` | `INTERVIEWS_AND_SURVEYS` | Both private families and common operations |
| `VALIDATION_PUBLIC_SURVEYS` | `ENABLED` | Publication, resolution and submission, only with an admitted survey mode |

Use explicit `DISABLED` for **both variables** for this code-only release.
Missing, empty, unknown or malformed values deny the corresponding capability;
there is no trimming or case folding. Public ENABLED alone grants nothing.
`VALIDATION_RELEASE_MODE`, NEXT_PUBLIC variants, NODE_ENV and test opt-ins cannot
enable these application capabilities. AI, preparation, promotion and qualified
readers remain unconditionally denied for every configuration.

## Before approving merge

1. Open Vercel in the intended owner/team account. Record the team, project name,
   project ID, root directory, linked GitHub repository and production domains.
   Confirm the repository is `OsaRete/saasscout-landing`, not a fork or similarly
   named project. Do not copy secrets into a review record.
2. In Git settings, verify the Production Branch is `main`. Record automatic
   Production and Preview deployment behavior, ignored-build rules and branch
   overrides. A merge verdict must include the deployment it triggers.
3. Inspect **Production, Preview and Development** environment scopes separately.
   Include team/shared variables, branch-specific Preview overrides, custom
   environments and build/install commands that could supply variables.
   Record the effective values of the two capability variables (not unrelated
   secrets). Require both DISABLED for every deployment accessible during PR 1.
   The local task environment is not evidence of Vercel environment values.
4. Inspect the exact deployment artifact/environment association. Environment
   changes do not rewrite old deployments; rebuilding/redeploying requires
   separate authorization. Check that the intended release contains the reviewed
   boundary, not just that project settings look disabled.
5. Inventory existing Production, Preview, branch and immutable deployment URLs,
   alternate domains/aliases and any older projects connected to this repository.
   Record which remain addressable and their deployment protection. Older builds
   may have no capability boundary and ignore these variables entirely. Have the
   owner resolve any exposed older Validation build before approving the release.
6. Review the unchanged 175-diagnostic TypeScript baseline and obtain actual
   required acceptance-workflow results for the exact proposed revision. Static
   source compatibility is not a passing PostgreSQL/PostgREST acceptance run.

## After a separately authorized deployment

7. Verify the deployment commit, project, target scope and aliases. Using synthetic
   IDs/tokens, make direct requests to every route/method in the saved route
   inventory. With both flags disabled, require the fixed `validation_disabled`
   503 response (HEAD has no body), private/no-store headers and no private fields.
   Test authenticated requests as well as missing credentials without logging
   bearer tokens. Unsupported verbs must not execute operations.
8. Visit `/validation`, `/validation/new`, a subject deep link and a synthetic
   `/validation/survey/<token>` link. Expect the unavailable notice; page HTTP 200
   is intentional. Require private/no-store caching and no private data requests.
   Check unrelated Discovery, Scan, Weekly and normal authentication behavior.
   Do not send real survey answers or run promotion/provider calls as a smoke test.
9. Record scope, deployment ID, timestamp, response status/headers and sanitized
   outcome. Do not infer absence of database side effects solely from HTTP output.
   Direct owner RLS reads and privileged SQL remain outside the application flags.

## Rollback preparation

10. Before merge, identify an already verified **boundary-containing, disabled**
    deployment as the rollback target and record its immutable ID and protection.
    If none exists, record that limitation and agree a restricted-ingress/recovery
    plan before approving automatic deployment. Do not blindly roll back to main
    before PR 1: that build can restore unguarded Validation routes regardless of
    these environment values.
11. If a separately authorized rollback is needed, retain both flags DISABLED,
    change only the approved deployment/aliases, repeat steps 7–9 and recheck older
    URLs. No database rollback, migration or evidence deletion is part of PR 1.

Until these operational facts and required checks have evidence, merge with
automatic Vercel deployment is **NO-GO**. Private/public activation is a separate
NO-GO pending the database and workflow gates in the release-boundary report.

## Minimal PR 1 closure record — owner execution only

Owner-provided evidence establishes `saasscout-landing` linked to
`OsaRete/saasscout-landing`, Production tracking `main`, other unassigned branches
using Preview, Standard Vercel Authentication, no known enabling variables or
protection exceptions, and no Preview custom domains. PR #237's Preview succeeded.
This is configuration evidence supplied by the owner, not an independently audited
inventory. Preview shares Production Supabase service-role credentials: **it is not
a disposable/data-isolated test environment**. Observe deployment metadata only;
do not run browser/API/database acceptance against that Preview, even behind login.

Complete and retain this short record before merge (no secret values):

- [ ] Record project/team IDs, exact source SHA and Production/Preview deployment
  IDs. For each scope, inspect `VALIDATION_PRIVATE_MODE` and
  `VALIDATION_PUBLIC_SURVEYS`, branch/custom/shared overrides and build/install
  commands. Missing values fail closed; explicit `DISABLED` is preferable for an
  auditable release. Never substitute `VALIDATION_PRIVATE_SURVEYS` for the actual
  `VALIDATION_PRIVATE_MODE` contract. Environment changes require separate approval
  and do not retrofit existing artifacts.
- [ ] Inventory previous Production, Preview/branch and immutable deployment URLs,
  custom aliases/domains and other linked projects. Record source/boundary presence
  and effective protection for every pre-boundary artifact. In a signed-out session
  with no bypass link, check authentication/edge protection without submitting forms
  or invoking application/API actions. If an old address remains public or otherwise
  usable without the boundary, record the exact URL and required containment;
  **obtain approval before** protection, alias, route or deployment changes.
  Standard Preview protection alone does not prove old Production URLs are covered.
- [ ] Record a boundary-containing, disabled recovery artifact and the supported
  production-target recovery action. The successful a42e21d Preview is a candidate,
  not automatically a verified Production rollback: verify source, environment
  parity and permitted recovery/promotion mechanics first. Pre-PR1 main lacks the
  guards and must not be selected as a boundary-preserving rollback.
- [ ] If no artifact qualifies, document the exact available edge/ingress control,
  affected hosts and both `/validation` and `/api/validation` paths plus public
  survey APIs, operator and restoration steps. Obtain explicit owner approval to
  restrict those paths while recovering a reviewed boundary-containing build with
  both flags disabled. Verify the project's plan supports that control; do not
  invent an available Vercel feature. Any restriction, deployment, promotion or
  alias change needs separate authorization. If neither recovery option can be
  established, merge remains blocked.
- [ ] Record owner acceptance of the existing shared-credential Preview exposure
  for protected, observation-only review, or request separate approval for isolated
  Preview credentials. Do not rotate shared Production credentials, change
  Production access or claim protection removes the risk. Keep the old-deployment
  containment requirement even if the owner accepts credential sharing.

Code rollback does not revert database state. This PR changes no migration bytes
or grants, and recovery must not reset Supabase or delete historical evidence.
Record the operator, timestamp, artifact ID, approved action and sanitized outcome.
None of these operational checks or configuration actions has been performed by
this local amendment. The remaining gate is the completed owner record, not a new
application implementation or a request for unrelated infrastructure.

## Beta PR 3 additions — still default-off

Include `VALIDATION_PRIVATE_LANDING_PAGES` and
`VALIDATION_PUBLIC_LANDING_PAGES` in the same per-scope/override/artifact checks;
require DISABLED until separate owner approval. Missing values deny admission.
Public landing admission additionally requires an admitted existing private mode,
private landing authoring and a stable server-only
`VALIDATION_LANDING_COOKIE_SECRET` (at least 32 characters). Record presence only,
never its value. Public surveys retain their independent existing switch.
Include `/validation/landing/<synthetic-token>`,
`/api/public/validation/landing/**`, and `/api/validation/landing-pages/**` in
route/recovery verification. Exact migration, isolated acceptance, retention,
trusted proxy and later activation steps are in
[Validation Landing Pages](VALIDATION_LANDING_PAGES.md). This appendix performs
no hosting/configuration action and does not satisfy the owner-only record.
