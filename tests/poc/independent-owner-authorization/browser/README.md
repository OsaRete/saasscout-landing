# B4.2-B2.15 — disabled two-stage browser interoperability

**Production owner withdrawal remains DISABLED and NO-GO.**
Synthetic custodian approval is not real independent identity verification.
Only browser test infrastructure and documentation change. No production
behavior, dependencies, Supabase, Validation workflows or Knowledge Evolution changes.
This improves evidence-provenance security knowledge protecting the Data Moat.

Verified main: `e4d187230e8736e6ffa2a444434093c10b49181f`, including merged
PR #231. Read [the merged protocol](../TWO_STAGE_ENROLLMENT.md).
PR #230 was inspected read-only at `8e83d761bab2f4868ce85208ca2d99869421e67d`;
it remains open, draft, unmerged and unchanged. This separate branch ports only
its two browser files. Git transport cannot connect to the runtime proxy;
the GitHub integration supplies hash-verified merged files and publishes directly
parenting verified main.

## Protocol and coverage

Prepare a credential-free session, obtain two pinned synthetic custodian signatures
and persist initiation before `navigator.credentials.create()`. Create uses the
approved session challenge. The raw generated ID and SPKI key form the final
canonical binding; `navigator.credentials.get()` signs its possession challenge.
Both custodians approve `enrollmentConfirmationBytes(initiation, finalRequest)`.
Confirm through the existing two-stage registry contract without modifying it.

The positive requires raw browser enrollment, exact registered credential, epoch
and immutable authorization history. Negatives cover missing final approvals,
a second browser key with matching create/get but the first key's approvals,
credential/handle/owner substitution, tampered create challenge, invalid possession
signature and expiry. A competing authorized session has its own browser create/get
and final approvals; after the winner enrolls, it must reject stale epoch/nonempty
state. Initial enrollment cannot isolate these two state conditions. Duplicate
confirmation and initiation replay reject after reopen with unchanged history.

Authentication covers valid signature, wrong origin/RP, owner, credential
identity/status, stale epoch, browser-signed wrong challenge, signature/data tampering,
missing UP and an actual missing-UV get. The durable boundary must accept the enrolled
credential once, then reject replay immediately and after SQLite reopen.
Adapter context negatives supplement the durable checks; they are privileged test
inputs, not production IAM tests. A failed enrollment positive fails the suite and
stops durable checks. No conditional replay skip or known-failure exemption remains.

Existing strict origin, RP, challenge, signature, UP/UV, COSE/SPKI identity, owner,
expiry, epoch and replay verification remains unchanged. Raw browser responses are
never rewritten for acceptance; deliberate mutations occur only in negative cases.
The restrictive CBOR/COSE, exact client JSON, flags and zero-AAGUID profile may still
reject Chromium output. Do not weaken it to force compatibility in this PR.

Uses existing Playwright, Chromium CDP CTAP2/internal, resident credentials, UV and
automatic presence on disposable loopback HTTPS. Gets pin the intended credential
ID to avoid selection ambiguity with multiple resident keys. Only the disposable
browser context ignores its certificate trust error. No application-facing API.
Default gate skips before reading TLS files or binding listeners. Explicit setup
errors fail; there is no mocked fallback.

## Exact Windows PowerShell execution

Use PowerShell 7 / .NET 8+ and Node.js 24, starting in your local repository.
If the branch exists locally, use `git switch codex/b42-b215-two-stage-browser-interop`
instead of the tracking command. The one-day certificate stays outside the repo;
no machine trust store changes.

```powershell
git fetch origin
git switch --track origin/codex/b42-b215-two-stage-browser-interop
code .
# Continue in the VS Code PowerShell terminal at the repository root.
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
npx playwright install chromium
if ($LASTEXITCODE -ne 0) { throw 'Chromium install failed' }
npx playwright --version
$fixtureDir = Join-Path ([IO.Path]::GetTempPath()) ('browser-webauthn-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $fixtureDir | Out-Null
$rsa = [Security.Cryptography.RSA]::Create(2048)
$req = [Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=localhost', $rsa, [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1)
$san = [Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
$san.AddDnsName('localhost')
$req.CertificateExtensions.Add($san.Build())
$cert = $req.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-1), [DateTimeOffset]::UtcNow.AddDays(1))
$certPath = Join-Path $fixtureDir 'localhost.pem'
$keyPath = Join-Path $fixtureDir 'localhost-key.pem'
[IO.File]::WriteAllText($certPath, $cert.ExportCertificatePem())
[IO.File]::WriteAllText($keyPath, $rsa.ExportPkcs8PrivateKeyPem())
try {
  $env:BROWSER_WEBAUTHN_POC = '1'
  $env:BROWSER_POC_CERT = $certPath
  $env:BROWSER_POC_KEY = $keyPath
  node --loader ./tests/support/server-only-loader.mjs --test --test-isolation=none tests/poc/independent-owner-authorization/browser/interop.test.mjs
  $testExit = $LASTEXITCODE
} finally {
  Remove-Item Env:BROWSER_WEBAUTHN_POC, Env:BROWSER_POC_CERT, Env:BROWSER_POC_KEY -ErrorAction SilentlyContinue
  $cert.Dispose()
  $rsa.Dispose()
  Remove-Item -Recurse -Force $fixtureDir
}
if ($testExit -ne 0) { throw "Interop probe failed (exit $testExit); inspect TAP; keep draft and inspect the failing strict check" }
```

Run regressions from the same VS Code terminal:

```powershell
node --test --test-isolation=none --loader ./tests/support/server-only-loader.mjs "tests/owner-authorization-*.test.ts" "tests/poc/independent-owner-authorization/*.test.mjs" tests/validation-promotion-foundation.test.ts tests/validation-promotion-dry-run.test.ts tests/validation-customer-interview-shareable-evidence.test.ts tests/trusted-qualified-evidence-reader.test.ts tests/qualified-evidence-integrity.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Focused regressions failed' }
npx eslint tests/poc/independent-owner-authorization/browser/interop.test.mjs
npx prettier --check tests/poc/independent-owner-authorization/browser/interop.test.mjs tests/poc/independent-owner-authorization/browser/README.md
npm run lint
npm run build
```

## Execution evidence and merge gate

Executed in Cloud on Node 24.19.0:

- Focused security plus relevant Validation/integrity/reader regressions:
  **349/349 PASS**, zero failures/skips.
- Default gate: **one SKIP**, zero browser tests executed.
- Explicit opt-in: **FAILED during HTTPS setup**:
  `Error: listen EPERM: operation not permitted 127.0.0.1`, syscall `listen`,
  errno `-1`. All browser ceremonies/cases **NOT EXECUTED**.
- Playwright 1.61.1 installed; expected Chromium 149.0.7827.55/revision 1228.
  `/home/agent/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome` absent.
  No download attempted after the listener restriction was established.
  Actual Chromium and virtual-authenticator execution did **not** occur.
- Targeted ESLint, Node syntax and Prettier: PASS.
- Repository lint: zero errors, four warnings in unchanged app files.
- Build FAILED in Turbopack CSS processing: creating new process / binding to
  a port / `Operation not permitted (os error 1)`. Successful build NOT VERIFIED.

Windows commands were NOT EXECUTED here. No offline pass or default skip establishes
browser interoperability. Hardware/other browsers, genuine independent identity,
production IAM and protected origin display remain unverified.

**Merge recommendation: NO-GO pending actual local Chromium execution and review.**
Leave draft; run the commands above and record Chromium version and full TAP output
before reconsidering merge of this test-only PR. Production owner withdrawal
remains DISABLED / NO-GO regardless of browser results. No merge, deployment,
production database operation or authorization activation is performed.
