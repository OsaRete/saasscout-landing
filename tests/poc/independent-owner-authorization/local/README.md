# B4.2-B2.6 — Disposable local verifier integration

**NOT EXECUTED.** Prepared against verified GitHub main
`140f5064046cae5fdd80385a662730bd1cf44846` (merged PR #222).
Run locally before claiming integration success. Do not run this entry point in
restricted Codex Cloud: it intentionally spawns real processes and binds loopback.
No mocks replace process separation. No production withdrawal is enabled.

## Prerequisites and exact command

Install Node.js **22.13+** (or Node 24 LTS) with built-in `node:sqlite`.
Use a disposable local checkout and an account permitted to create child processes,
bind an ephemeral IPv4 loopback port, and write SQLite files in its temp directory.
No npm install, external service, credentials or PowerShell modules are needed.
From the repository root in Windows PowerShell:

```powershell
node .\tests\poc\independent-owner-authorization\local\run.mjs
if ($LASTEXITCODE -ne 0) { throw 'Local verifier integration failed' }
```

The same entry point works from other shells with forward slashes. SQLite may
print an experimental-feature warning on Node 22. Do not suppress test failures.
Expected: exit 0, individual PASS lines and final
`PASS local independent verifier integration`. Any assertion, timeout, startup,
port or SQLite error must cause nonzero exit; it is not a passing or skipped test.
Record the Node version, OS and output when executed. Until then this remains
**NOT EXECUTED**, even if syntax and offline checks pass.

## Workloads and trust model

`run.mjs` is a privileged synthetic fixture owner, not the application. It generates
throwaway Ed25519 keys and a random client token, writes a temporary startup-only
verifier config, and starts `verifier.mjs` and `client.mjs` as independent Node
processes. It checks their PIDs differ and restarts the actual verifier process.
Children receive an empty environment, avoiding inherited application credentials.
The client receives signed synthetic fixtures, its token, loopback port and pinned
response public key; it receives no config, database path or response private key.
Synthetic owner signatures delivered by the harness model owner consent only.

The verifier reconstructs trusted enrollment and rotation via the unchanged B2.5
`createProtectedKeyAuthority` and external-decision simulation. Its verifier reuses
B2.4 canonical Ed25519 authorization. Expected owner/evidence/revision/audience,
keys and time are verifier configuration, never request input. Registry mutations,
recovery, replay reset and administrative routes do not exist on the API. The
trusted harness can replace configuration between runs; real enrollment or
independent identity authentication is not established by this setup.

The only route is POST `/verify`, returning an experimental verification receipt.
It never executes a withdrawal. Requests require a random bearer credential.
Responses are Ed25519 signed with a pinned verifier key, bind HTTP status and a
fresh 256-bit client nonce, and are checked by the client. Authentication/path
failures return a signed denial without echoing unparsed input. This is authenticated
local HTTP, **not encrypted transport**; it is unsuitable for real credentials or
remote use. The token authenticates a client, not owner consent. A request replay
still needs an unused valid owner signature.

`replay.mjs` uses a disposable SQLite table with a primary key on request ID,
WAL mode, FULL synchronous commits and atomic INSERT ON CONFLICT. The verifier
accepts only after the insertion commits. Reopening the same DB preserves consumed
IDs. It does not garbage collect IDs. Database errors deny verification. B2.5's
in-memory consume precedes SQLite: a storage failure can conservatively lose an
intent until restart, but cannot produce acceptance without durable consumption.

## Cases prepared

- Valid owner proof, altered payload/signature and attacker signatures.
- Genuinely signed wrong owner, evidence, audience and revision; expired proof.
- Caller-supplied replacement key and missing/wrong client credential rejection.
- Unauthorized enrollment, rotation, recovery, admin, registry and replay-reset calls.
- A rotated key is explicitly revoked by B2.5 and rejected as stale; the active
  replacement succeeds. Pending recovery separately rejects the current key.
- 32 concurrent HTTP requests for one proof: exactly one acceptance, 31 denials.
- After graceful verifier termination/restart with the same DB: old proof denied,
  fresh request accepted, demonstrating that the server is still functional.

## Cleanup

Normal success/failure stops children and removes its unique
`synthetic-owner-verifier-*` OS temporary directory, including config, synthetic
private keys, SQLite DB and WAL files. If the runner is forcibly killed, terminate
only its orphaned Node processes, then inspect and remove the matching directory:

```powershell
Get-ChildItem $env:TEMP -Directory -Filter 'synthetic-owner-verifier-*'
# After stopping this run's processes, remove its exact directory:
Remove-Item -LiteralPath '<exact directory from above>' -Recurse -Force
```

## Guarantees and limitations

When locally passing, these tests demonstrate cryptographic binding and rejection,
API-level registry immutability for the application credential, actual separate
processes, atomic duplicate denial and replay persistence across graceful restart.
They strengthen evidence-provenance security knowledge for the Data Moat; no
production architectural layer changes.

They do **not** demonstrate real IAM/OS-account isolation, resistance to host or
filesystem administrators, verifier compromise resistance, real independent
owner enrollment/recovery, key custody, confidentiality, production TLS/mTLS,
trusted clocks, durable registry lifecycle/audit transactions, multi-host behavior,
power-loss/crash durability, DoS resistance, rate limiting, signed receipt policy
for a protected executor, database RLS or actual Supabase credential restrictions.
Processes run under the same local user: an adversarial program with general host
access could find/modify files, steal credentials or replace code. The fixture
client exercises the API boundary only. Administrators can bypass enforcement.
SQLite replay consumption is not coupled to a production lifecycle transaction.
No receipt is production authority. B2.3's production NO-GO remains in force.

## Cloud-safe validation

Only syntax/format/lint and existing offline tests may run in restricted Cloud.
The local files intentionally do not match `*.test.mjs`, preventing accidental
execution by the existing offline test glob. Do not run a build that starts a
worker or opens a port in that runtime. Static/offline passes do not change the
integration execution status above.
