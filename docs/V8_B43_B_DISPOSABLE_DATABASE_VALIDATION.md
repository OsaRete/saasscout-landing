# B4.3-B Disposable Database Validation

## Scope and authorization

The B4.3-B PostgreSQL/PostgREST suite writes fixture data, changes source state, and injects temporary integrity faults. It is destructive to the target database and is permitted only against a freshly generated disposable Supabase project. The database runner never starts, resets, or migrates a project. Do not point it at the ordinary `saasscout-landing` project, any linked project, or a production database.

Starting the disposable project and resetting it are separate operations. Obtain explicit human authorization before startup and a separate explicit authorization before reset. The reset command drops and recreates the generated project's local database and reapplies its copied migration chain. Do not use an existing local SaaSScout project or its data for this suite.

## Isolated project layout

`scripts/prepare-validation-b43-disposable.ts` copies only the checked-out migration chain and optional seed into a new directory under the operating-system temporary directory. It creates a fresh project identifier of the form `saasscout-b43-disposable-<12 hex characters>`, rewrites only the copied Supabase config, and records its SHA-256 plus migration hashes in schema-versioned `.b43-disposable-identity.json`. It does not copy `.env` files, credentials, or the ordinary project config for use in place.

The disposable project uses these fixed local endpoints:

| Service | Endpoint | Port |
| --- | --- | ---: |
| API | `http://127.0.0.1:55431` | 55431 |
| PostgreSQL | `postgresql://postgres:postgres@127.0.0.1:55432/postgres` | 55432 |
| Shadow PostgreSQL | local Supabase shadow port | 55430 |

Preparation disables local SMTP (port 54324) and Edge Runtime (inspector port 8083), which the B4.3 suite does not use. Optional Studio, pooler, and analytics services remain disabled. Configuration validation parses every port-bearing setting and rejects any enabled port other than the three required API/database/shadow endpoints. The manifest config hash binds the validated copy against later edits. If the test suite starts depending on a disabled service, give it a separately allocated, verified endpoint before enabling it.

The explicit runner environment is `VALIDATION_B43_DISPOSABLE=1`, `VALIDATION_B43_PROJECT_DIR`, `VALIDATION_B43_PROJECT_ID`, `VALIDATION_B43_API_URL`, `VALIDATION_B43_DATABASE_URL`, and `VALIDATION_B43_DOCKER_NETWORK_ID`. The opt-in flag alone is never accepted as isolation evidence. Do not set generic `DATABASE_URL` or `PG*` overrides to select a target.

## Identity preflight

Before any test fixture write, the runner independently verifies all of the following:

1. The project id has the generated disposable prefix and random-id shape, matches the requested id and identity manifest, and is not `saasscout-landing`.
2. The manifest and project directory are inside the OS temporary directory, the config has the exact API/database/shadow ports and URLs, and the copied migration names and SHA-256 hashes match the checked-out migration chain.
3. `supabase --workdir <project> status -o json` reports the expected local API and database endpoints.
4. Docker's Supabase project label and Compose project label both equal the requested id. Exact `supabase_db_<project-id>` and `supabase_kong_<project-id>` names, expected Postgres/Kong image roles, running state, published ports, and unique container IDs identify the database and API. No service label is assumed because the installed Supabase CLI does not supply one consistently.
5. The expected Docker network ID must inspect as the exact `saasscout-b43-loopback-<project suffix>` bridge with `com.docker.network.bridge.host_binding_ipv4=127.0.0.1`. Every disposable project container must attach only to this network, and its attached-container set must contain no unrelated containers.
6. Each expected published port has exactly one explicit IPv4 `127.0.0.1` binding. Empty `HostIp`, wildcard bindings such as `0.0.0.0` or `::`, IPv6 bindings, additional published ports, duplicate bindings, and missing metadata all fail closed. A loopback URL or network default alone does not prove loopback-only exposure; active Docker bindings are checked independently.
7. PostgreSQL's `system_identifier` read inside the identified container matches the independent read through the fixed host database endpoint; the host query also checks the database name and server port.
8. A read-only PostgreSQL probe records `session_user` and `current_user`, requires both to be `postgres`, verifies the expected `BYPASSRLS` attribute, and rejects application-role `SET` paths to `postgres`. It does not require superuser status or `SET ROLE postgres`. The workflow then explicitly uses `--workdir` on the generated disposable project and `--local`; it does not invoke linked or URL-targeted reset behavior.

Any missing, ambiguous, or mismatched identity stops execution. Environment values cannot replace the Docker and PostgreSQL corroboration. If Docker Desktop reports an empty or wildcard host binding, the preflight intentionally refuses to continue; configure and independently verify loopback-only publication before a new attempt. A preflight is not proof that arbitrary machines are safe; it is the required target check immediately before reset and before fixture execution.

## Authorized local procedure

Use a review-approved shell and verify every generated path and identity before proceeding. These commands are instructions only; they have not been run as part of this change.

```powershell
$prepared = node scripts/prepare-validation-b43-disposable.ts | ConvertFrom-Json
$env:VALIDATION_B43_DISPOSABLE = "1"
$env:VALIDATION_B43_PROJECT_DIR = $prepared.projectDir
$env:VALIDATION_B43_PROJECT_ID = $prepared.projectId
$env:VALIDATION_B43_API_URL = $prepared.apiUrl
$env:VALIDATION_B43_DATABASE_URL = $prepared.databaseUrl
$env:SUPABASE_TELEMETRY_DISABLED = "1"
$suffix = $prepared.projectId.Substring("saasscout-b43-disposable-".Length)
$networkName = "saasscout-b43-loopback-$suffix"

# Requires explicit authorization to create this uniquely named local Docker network.
if (docker network ls --format "{{.Name}}" | Where-Object { $_ -eq $networkName }) {
  throw "The dedicated B4.3 network name already exists"
}
$env:VALIDATION_B43_DOCKER_NETWORK_ID = docker network create --driver bridge --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 $networkName
$network = docker network inspect $env:VALIDATION_B43_DOCKER_NETWORK_ID | ConvertFrom-Json
if ($network.Name -ne $networkName -or $network.Driver -ne "bridge" -or
    $network.Options.'com.docker.network.bridge.host_binding_ipv4' -ne "127.0.0.1" -or $network.Containers.Count -ne 0) {
  throw "The dedicated B4.3 network failed identity verification"
}

# Requires separate explicit human authorization to start the newly created project.
supabase --workdir $env:VALIDATION_B43_PROJECT_DIR start --network-id $env:VALIDATION_B43_DOCKER_NETWORK_ID

# Verify identity before any destructive reset.
node scripts/validation-b43-db.ts --preflight-only

# Requires a separate explicit human authorization. This resets only the generated temp project.
supabase --workdir $env:VALIDATION_B43_PROJECT_DIR --network-id $env:VALIDATION_B43_DOCKER_NETWORK_ID db reset --local --no-seed

# Re-verifies identity and migration/freshness conditions before fixture writes.
node scripts/validation-b43-db.ts
```

If an operation fails, stop. Do not substitute `supabase link`, a remote database URL, ordinary ports 54321/54322, or another project directory. The temporary project and containers should be removed only through a separately reviewed cleanup after recording results; the runner does not clean them up automatically.

## CI boundary

The B4.3-B database job is separate from the B3.1/B4.2 job and is manual-dispatch only. Its required boolean `authorize_disposable_reset` defaults to false; the job is skipped unless the operator explicitly sets it true. Configure the GitHub environment `b43-disposable-database-validation` with required human reviewers in repository settings. The workflow generates a unique temporary project, creates and verifies an empty dedicated bridge network with a loopback default binding, starts the project with that exact network ID and explicit workdir, and runs the identity and database-principal preflight before reset. The reset step explicitly uses `--workdir <generated-project-dir>` and `--local`, avoiding linked or URL-targeted reset semantics. The same identity inputs are passed to the test runner, which re-verifies before fixture writes. The runner itself has no start/reset command.

The B4.3 migration is designed for Supabase's non-superuser `postgres` migration principal and provisions no roles or memberships. Its `SECURITY DEFINER` functions are owned by `postgres`, which has `BYPASSRLS`; they do not rely on RLS for authorization. Direct fact-table privileges are revoked from application roles, all B4.3 function execution is revoked from application roles, and the reader remains unavailable through PostgREST. Runtime CI must verify object ownership, grants, function attributes/search paths, application-role escalation denials, and the complete B3.1/B4.2 migration chain. Static checks do not establish the actual Supabase execution principal or runtime behavior.

Repository YAML cannot enforce the environment's required-reviewer setting. A repository administrator must configure and verify that protection before enabling this workflow. CI is not authorized to touch developer-local or production databases.

## Coverage and limits

The database suite is designed to exercise the complete migration chain, private fact-table immutability and direct privileges, postgres ownership/search paths/SECURITY DEFINER attributes, absence of new roles, application-role escalation and trigger-tampering denials, PostgREST denials for all application roles, atomic WITHHELD insertion, forged-positive-authority rejection, rollback on authority-write failure, source restrictions, participant withdrawal/restoration, session relevance and cancellation, experiment completion/cancellation, classification supersession and ambiguity, canonical merge/deactivation/conflicting merge state, proof and schema corruption, bounded candidate overflow, fail-closed current reads through the trusted disposable SQL connection, trusted B3.1/B4.2 behavior and polarity, and independent-backend lock overlap followed by post-commit exclusion.

The integration suite is not a substitute for review of PostgreSQL runtime behavior. It has not run merely because static tests pass. A successful empty current read remains distinct from unavailable authority only as defined by the migration contract; this suite must not be described as issuing positive authority. No positive authority issuer, restoration, external revocation operation, historical backfill, or downstream consumer is covered or enabled here.

## Docker Desktop incident note

On 2026-10-30, read-only inspection found the older protected `supabase_db_saasscout-survey-integrity-disposable` container exited with code 134. Docker reported `chown ...: read-only file system`; the event stream recorded the matching container `die` event. This is evidence of the reported filesystem error, not proof of a deeper cause, and there is no evidence tying it to B4.3. Do not restart or repair that container as part of B4.3 validation. The runner also fails closed on Docker Desktop bindings whose `HostIp` is empty or wildcard.

## C1 reset network diagnostic — 2026-11-03

[Manual run 41709263254](https://github.com/OsaRete/saasscout-landing/actions/runs/41709263254),
job `126172741532`, tested commit `c3b4e2759f148dea3959c93ab308e7e26c940d98`.
Logs report CLI 2.118.0, Docker 29.4.2 and host psql 18.6; copied config selects
PostgreSQL 17. Generated project `saasscout-b43-disposable-726c71cb366a` passed
the full identity/privilege preflight before reset. Reset reported all migrations,
including C1, applied, then failed waiting for Storage readiness. Storage repeatedly
logged `getaddrinfo EAI_AGAIN` for that project's database hostname. The SQL suite
step was skipped. Migration application is not evidence that the SQL tests passed.

The workflow passed the custom network ID to startup but omitted it from reset.
CLI 2.118.0 has a per-invocation global `--network-id` flag. Its
[UpdateDockerIds](https://github.com/supabase/cli/blob/v2.118.0/apps/cli-go/internal/utils/config.go#L61)
selects `supabase_network_<project>` when the flag is absent. For PostgreSQL 15+,
[resetDatabase15](https://github.com/supabase/cli/blob/v2.118.0/apps/cli-go/internal/db/reset/reset.go#L114)
removes/recreates the database container and volume, attaching the replacement to
that invocation's selected network. Other services are restarted in place.
Consequently, reset selects a different network from the custom bridge selected
at startup. This source-proven configuration defect explains the observed DNS
failure; no generic transient-DNS assumption or blind readiness retry is justified.

There is no post-failure Docker inspect/network inventory in the retained logs,
and the completed GitHub-hosted runner cannot be inspected live here. Actual final
network attachments, aliases, port bindings and cluster identity were therefore
not directly captured. Pre-reset isolation passed; post-reset isolation did not
receive its required verification. The topology explanation is strongly supported
by command/source evidence, not a claimed runtime reproduction.

The minimal correction supplies the same verified network ID explicitly to reset.
No service is disabled, timeout extended, preflight bypassed or retry added. The
unchanged suite entry rechecks project/manifest/migration hashes, all container and
network identities, loopback ports, host-versus-container system_identifier and
principal privileges before fixture writes. PostgreSQL 17 reset legitimately
replaces the cluster, so its system_identifier may change across reset; the new
host endpoint must match the independently identified replacement container.

The final isolated step now invokes `node scripts/validation-b43-db.ts` directly,
as the preflight already does. `npm run` prepends node_modules/.bin, where the
lockfile installs CLI 2.109.1; direct Node execution preserves setup-cli's PATH and
uses the installed 2.118.0 for the runner's local status command. The failed reset
itself used 2.118.0, before that npm step, so this version mismatch did not cause
the observed reset failure. No dependency upgrade is included.

The B3.1/B4.2/B4.3 runners and SQL fixtures do not invoke Storage object APIs or
bucket operations. The optional Storage API service could be excluded in a
separately reviewed disposable profile, retaining PostgreSQL/auth/PostgREST/Kong
and their SQL requirements. That would not repair the network split affecting
required services, and could conceal its first symptom. Storage remains enabled.

An automated reset retry is not authorized by this correction. The failed project
must not be restarted/reset by name without independently re-establishing every
identity and privilege invariant. A new separately authorized workflow execution
creates a fresh temporary project and repeats all checks; it does not reuse this
failed runner. Any future bounded readiness retry must validate topology and
cluster identity before each attempt, retain finite limits and exit nonzero on
identity drift. Do not accept completed migrations alone as a successful reset.

Workflow regression tests require matching startup/reset network bindings,
explicit local workdir/reset flags and direct suite execution. A simulated
replacement database on the fallback network is rejected by the unchanged
container identity validator. These are static/unit checks, not Docker runtime
verification. Controlled F3 schedules and the separate private-reader RPC harness
issue remain open. No further workflow was dispatched in preparing this fix.
