# Contact a Professional

The Beta flow prepares a plain-text draft in the browser for the SaaSScout
founder at `cedeomartineze@gmail.com`. The existing workspace gate checks the
signed-in user's Beta access through `/api/user/capabilities` before mounting the
form. After affirmative consent, the user opens their email app, reviews the
message and sends it there. A manual copy option covers missing email handlers
and clients that truncate long drafts.

The message contains only fields entered in the form. The application makes no
network request containing inquiry data and does not store the inquiry. The
recipient and subject are fixed. User-entered text is encoded into the
`mailto:` body only. The UI reports draft preparation and cannot confirm
acceptance or delivery by a user's email app.

## Beta setup

No feature-specific environment variables, provider account, migration, or
deployment configuration are needed. The existing workspace requires
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` in the normal application configuration. Check that
the founder can receive a test message and that a supported desktop and mobile
email client opens the draft before launch.

## Enabling direct delivery

The repository has no approved application mail provider integration. Direct
delivery cannot be enabled by setting an environment variable in this release.
Before implementing it, approve an existing transactional mail service, verify
the sender identity and configure its domain records as required by that
provider. Supply the provider's send-scoped credential and verified From
identity as private deployment variables. Their exact names and the provider's
domain records depend on the approved integration.

The follow-up integration must use the existing server-side Beta authorization,
a bounded request body, server-side schema and consent checks, a shared rate
limit and idempotency across instances, a fixed recipient, and validated
Reply-To. Use plain text or escape user content in any HTML version. Confirm
provider acceptance before reporting submission success and keep inquiry
payloads and contact information out of operational logs. Rate limiting and
provider failure handling belong to that integration. The Beta flow has no
server mail endpoint.
