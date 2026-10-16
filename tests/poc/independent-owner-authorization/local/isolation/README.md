# B4.2-B2.7 — Disposable authorization isolation boundary

Prepared from verified main `3b7d74be3d583d29cf6df1038d40c87f494ffea8`
(merged PR #223). **Real isolation tests NOT VERIFIED: not executed in Cloud.**
This extends the existing local runner; it is not a production service.

The trusted root fixture coordinator generates synthetic keys and signed owner
fixtures, then executes the unchanged verifier protocol under UID/GID 10002 and
the adversarial client under UID/GID 10001. The verifier directory is 0700,
owned by 10002; startup config is 0600. Config contains the trusted owner-key
registry, verifier response private key and synthetic client credential. SQLite,
WAL and SHM live in that directory. The app knows their exact paths and attempts
read, overwrite, unlink, rename, chmod and recursive directory removal. Only
EACCES/EPERM is an acceptable denial. Tests run before acceptance and again after
a real verifier restart; fresh signed authorization must still succeed.

The client also attempts key substitution, service_role/internal_tester HMAC
forgery, missing proof, substituted bearer credentials and enrollment, rotation,
revocation, recovery and replay-reset routes. The real verifier must deny these,
accept exactly one of 32 concurrent valid requests and preserve replay denial
across restart. Trusted startup enrollment/rotation and pending-recovery denial
reuse B2.5. The application receives signed fixtures, never owner private keys.
Successful owner fixtures are deliberate synthetic owner consent, not an app's
ability to issue consent. No Supabase credential powers are exercised.

## Windows PowerShell: prerequisites and execution

Requires Docker Desktop installed and running in **Linux containers** mode, with
WSL2 backend or another supported Linux VM. Installation/WSL2 enablement may
require elevation; do that separately under your local policy. These commands do
not install software, create host users or require an elevated PowerShell.
Docker access itself is powerful; use a disposable machine/context you trust.
No `--privileged`, host networking, host PID namespace, Docker socket, host bind
mounts, secrets, real credentials or production data may be supplied.

From the repository root, first perform this read-only prerequisite check:

```powershell
Get-Command docker -ErrorAction Stop
$os = docker info --format '{{.OSType}}'
if ($LASTEXITCODE -ne 0 -or $os -ne 'linux') { throw 'Start Docker Desktop in Linux containers mode' }
docker version
if ($LASTEXITCODE -ne 0) { throw 'Docker prerequisite failed' }
```

Build context must be exactly the POC directory (not the repository):

```powershell
docker build --tag saasscout-b27-disposable --file .\tests\poc\independent-owner-authorization\local\isolation\Dockerfile .\tests\poc\independent-owner-authorization
if ($LASTEXITCODE -ne 0) { throw 'Isolation image build failed' }
docker run --rm --network none --read-only --tmpfs /tmp:rw,nosuid,nodev,noexec,size=64m --cap-drop ALL --cap-add SETUID --cap-add SETGID --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add KILL --security-opt no-new-privileges:true --pids-limit 64 --memory 256m --cpus 1 saasscout-b27-disposable
if ($LASTEXITCODE -ne 0) { throw 'Real isolation test FAILED; do not claim PASS' }
docker image rm saasscout-b27-disposable
```

Root coordinator capabilities are confined to the container; they permit fixture
ownership setup, dropping child identities and stopping children on failure. Executed non-root children have
no effective capabilities and cannot regain them with no-new-privileges. Code is
on a read-only root filesystem. Loopback works inside the isolated network
namespace; no ports are published. /tmp is disposable. `--rm` cleans container
state even on test failure. If forcibly interrupted, inspect `docker ps -a` and
remove only the specific leftover test container. No persistent volumes exist.
Record Docker version, image ID, OS, full output and exit code. Expected final
line: `PASS disposable UID/storage isolation boundary`. An error or timeout is
FAIL, never a skip/pass. A successful run is required before upgrading any
runtime claim below. The mutable Node base tag is test convenience; record its
resolved image digest for reproducibility.

## Security claims and evidence polarity

| Claim                                                     | Current result | Meaning                                                                              |
| --------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| Cryptographic correctness                                 | PASS           | Existing 44 offline B2.4/B2.5 tests; narrow synthetic protocol/policy only           |
| Local process separation                                  | NOT VERIFIED   | Prepared integration not executed here                                               |
| Linux UID/container storage isolation                     | NOT VERIFIED   | Exact-path permission attacks prepared; requires command above                       |
| Verifier authorized operations while app denied           | NOT VERIFIED   | Positive acceptance, rotation and replay restart controls prepared                   |
| App/service credentials cannot bypass this verifier       | NOT VERIFIED   | Runtime attacks prepared; no production enforcement claim                            |
| Real production IAM separation                            | NOT VERIFIED   | No cloud IAM, deployment or Supabase access tested                                   |
| Protection against host/verifier administrator compromise | FAIL           | Trusted coordinator, host/Docker admin or compromised verifier can replace authority |
| Real independent enrollment/recovery identity             | NOT VERIFIED   | External decision issuer remains simulated                                           |

PASS is narrowly scoped evidence; FAIL denotes an unsupported guarantee; NOT
VERIFIED denotes missing execution/evidence. Historical B2.3 NO-GO remains.
This proves no protection against kernel compromise, host-root access, trusted
coordinator compromise, verifier compromise, same-UID verifier administrators,
production database bypass or an application that simply ignores a receipt.
No privileged production executor exists in this POC. UID isolation is a local
kernel boundary, not independently administered production IAM. Lifecycle
registry history is reconstructed from trusted startup fixtures, not a durable
lifecycle registry/audit service. Replay uses graceful restart, not crash/power
loss. No lifecycle transaction coupling, trusted time or TLS claim is made.

No production routes, migrations, RLS, schemas, credentials, evidence polarity,
historical proof, canonical assignments or consumers change. Withdrawal,
revocation and privacy deletion remain disabled; key revocation test requests
are denials only. No Knowledge Evolution integration or historical backfill.
This improves security evidence for future Validation provenance/Data Moat
protection without changing any production architectural layer.

Smallest next step: execute this exact disposable test locally and attach its
output before considering a separately reviewed production IAM/executor design.
Cloud validation is offline tests plus syntax, lint and format only; no Docker,
child-process integration, loopback or worker-starting build is attempted.
