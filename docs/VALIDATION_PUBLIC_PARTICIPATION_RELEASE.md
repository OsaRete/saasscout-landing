# Public Validation participation release

## Consent and publication lifecycle

Survey participants affirm the versioned participation notice before submitting.
The notice describes voluntary participation, private creator review for idea
validation and the absence of a contact field. The API requires a literal
affirmative boolean and the current notice version. The service-only submission
RPC requires the version and records it on the immutable submission with the
server-issued `submitted_at` timestamp. An identical accepted retry keeps the
original receipt. Historical submissions have a null notice version. The
receipt authorizes participation for this research purpose and carries no
evidence qualification.

The existing Privacy Policy is linked. Before public collection, the owner must
confirm the retention and deletion handling for public responses, how a
participant without an account can exercise privacy requests when no contact
identifier is collected, and which responsibilities belong to SaaSScout and the
experiment creator. This release adds no contact field or follow-up permission.

All five public links expire 720 hours after issuance. PostgreSQL checks the
deadline after the relevant locks and before admitting a resolution, response
or tracking event. Operations admitted before the deadline can complete under
the existing transaction locks. Owner workspaces display the UTC deadline and
retain their revoke or unpublish action. Survey owners can revoke then publish
again. The other methods can republish directly. Existing links close at the
migration transaction's start. Retained responses, events, identities and
collection counters stay available under the existing owner boundaries.
Republishing generates a new link and does not reset collection usage.

## Owner-operated Vercel configuration

Vercel applies Deployment Protection before Next.js routing. The repository
configuration defines the existing cron and has no middleware or proxy that
can grant an exception at Vercel's protection layer. The public pages and
matching APIs use existing release flags and publication tokens. Owner data
and commands on the production domain require a SaaSScout session and
server-side owner checks. The owner workspace shell can load without owner data.

1. In Vercel, open the approved SaaSScout project. Check **Settings → Domains**.
   Confirm that `www.trysaasscout.com` is the approved production serving domain.
   Account for every additional Production alias because this scope covers all
   Production domains. Keep any separate Preview or recovery URL protected.
   Stop if an unapproved Production alias would become public.
2. Under **Security → Deployment Protection**, keep **Vercel Authentication**
   enabled and set its scope to current **Standard Protection**. If already
   configured this way, retain it. This opens the approved production domain
   while retaining authentication for generated immutable deployment URLs,
   Preview URLs and non-production aliases. Review the protection exceptions
   and share links for the staged candidate and recovery artifacts. The
   Preview-domain exception feature does not provide a Production path rule.
   Use no automation bypass credential in participant distribution.
3. After the owner-authorized promotion, use a signed-out browser on exactly
   `www.trysaasscout.com`. Verify all five paths with approved synthetic links
   (`/validation/survey/`, `/validation/landing/`, `/validation/prototype/`,
   `/validation/external-mvp/` and `/validation/commercial-intent/`). Check
   that their same-origin `/api/public/surveys/` and
   `/api/public/validation/` calls reach the application, including collection
   calls and closed-link denials. Confirm participant URLs use the approved
   hostname and contain only the publication token.
4. Check that direct access to the new artifact's immutable URL, both staged
   deployment URLs, and representative Preview/branch URLs is challenged in a
   signed-out browser. Verify private Validation APIs and owner commands reject
   signed-out callers on the approved domain. Use two approved test owners to
   confirm cross-owner read and write isolation. If owner dashboard URLs must
   also be gated by Vercel Authentication on the same hostname, Standard
   Protection cannot express that path split. Keep release closed until an
   owner-approved isolated ingress arrangement is available.

[Deployment Protection scopes](https://vercel.com/docs/deployment-protection)
and [Deployment Protection Exceptions](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions).

## Migration and rollout order

1. Before merge, confirm that merging will not automatically assign Production
   domains or deploy the application ahead of the migration. Keep all five public
   capabilities off on the serving artifact or keep ingress protected and drain
   public traffic and owner publishing during cutover. Keep Open Free Beta closed
   and paid-provider spending disabled.
2. After explicit owner approval, apply only
   `20261123000000_validation_public_participation.sql` after the confirmed
   ledger through `20261122000000`. The transaction closes prior links and
   retires the five-argument Survey submission RPC. Confirm the PostgREST schema
   reload, the service-only six-argument RPC and browser role denials. Older
   artifacts can continue private operations with the additive fields, but their
   Survey submissions fail closed. The new Survey application needs the migration
   before it can reliably publish and collect.
3. Deploy the reviewed artifact with public collection off. Verify private
   isolation and that closed routes fail as expected. Preserve the staged
   disabled recovery and enabled candidate. After a separate owner decision,
   use the new reviewed deployment for authorized public collection, apply or
   verify the hostname scope above and issue fresh synthetic publications for
   the signed-out checks. Keep public collection closed if those checks fail.
4. For recovery, return to closed collection with the approved disabled artifact.
   Keep the additive migration and history. The old enabled candidate cannot
   submit Survey responses against the upgraded catalog.

Merge is conditional on final-head checks and a confirmed hold on automatic
Production rollout. Production release remains gated on owner approval of the
privacy decisions, the migration and live Auth/PostgREST and ingress checks.
