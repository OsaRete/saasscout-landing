// Untrusted workload: receives client credential, pinned response public key,
// and synthetic signed attack fixtures. Never receives registry or DB paths.
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  renameSync,
  chmodSync,
  rmSync,
} from "node:fs";
import assert from "node:assert/strict";
import { randomBytes, createPublicKey, verify } from "node:crypto";
process.once("message", async (cfg) => {
  try {
    assert.notEqual(process.pid, cfg.verifierPid);
    if (cfg.protectedPaths?.length) {
      assert.equal(process.getuid(), 10001);
      assert.match(
        readFileSync("/proc/self/status", "utf8"),
        /^CapEff:\s+0+$/m,
      );
      assert.throws(() => process.kill(cfg.verifierPid, 0), { code: "EPERM" });
      // Known exact paths: denial must come from permissions, not obscurity.
      for (const path of cfg.protectedPaths) {
        for (const attack of [
          () => readFileSync(path),
          () => writeFileSync(path, "SYNTHETIC-TAMPER"),
          () => unlinkSync(path),
          () => renameSync(path, path + ".replaced"),
          () => chmodSync(path, 0o666),
          () =>
            rmSync(path.slice(0, path.lastIndexOf("/")), { recursive: true }),
        ])
          assert.throws(
            attack,
            (error) => error.code === "EACCES" || error.code === "EPERM",
          );
      }
      console.log(
        "PASS application UID denied credential/registry overwrite and replay read/write/reset",
      );
    }
    const key = createPublicKey(cfg.responsePublicKey);
    async function request(authorization, path = "/verify", token = cfg.token) {
      const nonce = randomBytes(32).toString("hex");
      const response = await fetch(`http://127.0.0.1:${cfg.port}${path}`, {
        method: "POST",
        headers: token === null ? {} : { authorization: `Bearer ${token}` },
        body: JSON.stringify({ nonce, authorization }),
        signal: AbortSignal.timeout(5000),
      });
      const envelope = await response.json();
      assert.ok(
        verify(
          null,
          Buffer.from("local-verifier-response:v1\n" + envelope.payload),
          key,
          Buffer.from(envelope.signature, "base64url"),
        ),
      );
      const receipt = JSON.parse(envelope.payload);
      assert.equal(receipt.status, response.status);
      // Pre-body authentication/path denials deliberately have no reflected nonce.
      if (path === "/verify" && token === cfg.token)
        assert.equal(receipt.nonce, nonce);
      return receipt;
    }
    if (cfg.phase === "restart") {
      assert.equal((await request(cfg.valid)).status, 403);
      assert.equal((await request(cfg.fresh)).status, 200);
      console.log(
        "PASS replay after restart; fresh authorization after restart",
      );
    } else {
      for (const [name, authorization] of cfg.attacks) {
        assert.equal((await request(authorization)).status, 403, name);
        console.log(`PASS ${name}`);
      }
      if (cfg.phase === "suspended") {
        process.send({ ok: true });
        process.disconnect();
        return;
      }
      assert.equal(
        (await request(cfg.valid, "/verify", "synthetic-wrong-token")).status,
        403,
      );
      assert.equal((await request(cfg.valid, "/verify", null)).status, 403);
      for (const token of [
        "SYNTHETIC-ONLY-service_role",
        "SYNTHETIC-ONLY-internal_tester",
      ])
        assert.equal((await request(cfg.valid, "/verify", token)).status, 403);
      console.log(
        "PASS unauthenticated and substituted application credentials denied",
      );
      for (const path of [
        "/enroll",
        "/rotate",
        "/recover",
        "/revoke",
        "/begin-recovery",
        "/admin",
        "/registry",
        "/reset-replay",
      ])
        assert.equal((await request(cfg.valid, path)).status, 403, path);
      console.log("PASS unauthorized administrative operations");
      const receipts = await Promise.all(
        Array.from({ length: 32 }, () => request(cfg.valid)),
      );
      assert.equal(receipts.filter((r) => r.status === 200).length, 1);
      assert.equal(receipts.filter((r) => r.status === 403).length, 31);
      const accepted = receipts.find((r) => r.status === 200);
      assert.equal(accepted.result.verifier_pid, cfg.verifierPid);
      assert.equal(
        accepted.result.request_id,
        JSON.parse(cfg.valid.payload).request_id,
      );
      console.log(
        "PASS valid owner authorization; 32 concurrent duplicates: exactly one accepted",
      );
    }
    process.send({ ok: true });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    process.send({ ok: false });
  }
  process.disconnect();
});
