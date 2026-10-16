// Explicit local entry point. NEVER run in restricted Codex Cloud.
import { fork } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  chmodSync,
  chownSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyPairSync, randomBytes, createHmac } from "node:crypto";
import { createSignedAuthorization } from "../authorization.mjs";
import { keyFingerprint, LIFECYCLE_AUDIENCE } from "../key-lifecycle.mjs";
const dir = mkdtempSync(join(tmpdir(), "synthetic-owner-verifier-"));
const isolated = process.argv.includes("--isolation");
if (isolated && (process.platform !== "linux" || process.getuid() !== 0))
  throw Error(
    "Isolation mode requires the disposable Linux container root coordinator",
  );
const children = new Set();
// Only the trusted coordinator has root. Executed children lose root capabilities.
if (isolated) {
  chmodSync(dir, 0o700);
  chownSync(dir, 10002, 10002);
}
const publicPem = (key) => key.export({ type: "spki", format: "pem" });
const privatePem = (key) => key.export({ type: "pkcs8", format: "pem" });
const pair = () => generateKeyPairSync("ed25519");
const old = pair(),
  owner = pair(),
  attacker = pair(),
  response = pair();
const now = Math.floor(Date.now() / 1000);
const expected = {
  owner_id: "synthetic-owner",
  evidence_promotion_id: "synthetic-evidence",
  revision: 7,
  audience: "synthetic-local-verifier",
};
const payload = {
  version: 1,
  ...expected,
  operation: "withdraw",
  request_id: "synthetic-valid",
  issued_at: now,
  expires_at: now + 300,
};
const signed = (changes = {}, key = owner.privateKey) =>
  createSignedAuthorization({ ...payload, ...changes }, key);
const valid = signed();
const token = randomBytes(32).toString("hex");
const cfg = {
  isolated,
  token,
  expected,
  database: join(dir, "replay.sqlite"),
  responseKey: privatePem(response.privateKey),
  registry: [
    {
      owner: expected.owner_id,
      key: publicPem(old.publicKey),
      rotation: {
        nextKey: publicPem(owner.publicKey),
        authorization: signed(
          {
            operation: "rotate-key",
            audience: LIFECYCLE_AUDIENCE,
            revision: 1,
            evidence_promotion_id: keyFingerprint(owner.publicKey),
            request_id: "synthetic-rotation",
          },
          old.privateKey,
        ),
      },
    },
  ],
};
const configPath = join(dir, "verifier.json");
writeFileSync(configPath, JSON.stringify(cfg), { mode: 0o600 });
if (isolated) chownSync(configPath, 10002, 10002);
function launch(name) {
  const child = fork(
    fileURLToPath(new URL(name, import.meta.url)),
    name === "verifier.mjs" ? [configPath] : [],
    {
      ...(isolated
        ? {
            uid: name === "verifier.mjs" ? 10002 : 10001,
            gid: name === "verifier.mjs" ? 10002 : 10001,
          }
        : {}),
      env: {},
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    },
  );
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}
function message(child, input) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("workload timeout"));
    }, 15000);
    const onExit = (code) => {
      cleanup();
      reject(Error(`workload exited before reply: ${code}`));
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    function cleanup() {
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onError);
    }
    child.once("exit", onExit);
    child.once("error", onError);
    child.once("message", (value) => {
      cleanup();
      resolve(value);
    });
    if (input) child.send(input);
  });
}
function exited(child, stop = false) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null)
      return child.exitCode === 0 ? resolve() : reject(Error("child failed"));
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("shutdown timeout"));
    }, 10000);
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(Error(`child failed: ${code}`));
    });
    if (stop) child.send("stop");
  });
}
async function runClient(server, phase, attacks = []) {
  const child = launch("client.mjs");
  const result = await message(child, {
    phase,
    protectedPaths: isolated
      ? [configPath, cfg.database, cfg.database + "-wal", cfg.database + "-shm"]
      : [],
    attacks,
    valid,
    fresh: signed({ request_id: "synthetic-after-restart" }),
    token,
    port: server.port,
    verifierPid: server.pid,
    responsePublicKey: publicPem(response.publicKey),
  });
  await exited(child);
  if (!result.ok) throw Error("client assertions failed");
}
try {
  let verifier = launch("verifier.mjs");
  const server = await message(verifier);
  const attacks = [
    ["invalid signature", signed({}, attacker.privateKey)],
    ["missing owner proof", null],
    ...["service_role", "internal_tester"].map((credential) => [
      `${credential} is not owner authority`,
      {
        ...valid,
        signature: createHmac("sha512", `SYNTHETIC-ONLY-${credential}`)
          .update(valid.payload)
          .digest("base64url"),
      },
    ]),
    ["tampered signature", { ...valid, signature: "A".repeat(86) }],
    [
      "tampered payload",
      {
        ...valid,
        payload: valid.payload.replace(
          "synthetic-evidence",
          "altered-evidence",
        ),
      },
    ],
    ...["owner_id", "evidence_promotion_id", "audience"].map((field) => [
      `wrong ${field}`,
      signed({ [field]: "synthetic-wrong" }),
    ]),
    ["wrong revision", signed({ revision: 8 })],
    [
      "expired authorization",
      signed({ issued_at: now - 100, expires_at: now - 1 }),
    ],
    [
      "unauthorized key substitution",
      {
        ...signed({}, attacker.privateKey),
        public_key: publicPem(attacker.publicKey),
      },
    ],
    ["stale rotated owner key", signed({}, old.privateKey)],
  ];
  await runClient(server, "initial", attacks);
  await exited(verifier, true);
  verifier = launch("verifier.mjs");
  await runClient(await message(verifier), "restart");
  await exited(verifier, true);
  // Trusted harness suspends the enrolled owner through B2.5 on next startup.
  cfg.registry = [
    {
      owner: expected.owner_id,
      key: publicPem(owner.publicKey),
      suspended: true,
    },
  ];
  writeFileSync(configPath, JSON.stringify(cfg), { mode: 0o600 });
  verifier = launch("verifier.mjs");
  await runClient(await message(verifier), "suspended", [
    ["pending recovery owner key", signed({ request_id: "synthetic-revoked" })],
  ]);
  await exited(verifier, true);
  console.log("PASS local independent verifier integration");
  if (isolated) console.log("PASS disposable UID/storage isolation boundary");
} finally {
  await Promise.all(
    [...children].map(
      (child) =>
        new Promise((resolve) => {
          child.once("exit", resolve);
          child.kill();
        }),
    ),
  );
  rmSync(dir, { recursive: true, force: true });
}
