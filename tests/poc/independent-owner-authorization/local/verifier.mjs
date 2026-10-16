// LOCAL ONLY. Do not import this executable from offline tests.
import http from "node:http";
import { readFileSync } from "node:fs";
import {
  createPublicKey,
  createPrivateKey,
  sign,
  timingSafeEqual,
} from "node:crypto";
import {
  createProtectedKeyAuthority,
  createSimulatedExternalAuthority,
} from "../key-lifecycle.mjs";
import { openReplay } from "./replay.mjs";
const cfg = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (
  cfg.isolated &&
  (process.getuid() !== 10002 ||
    !/^CapEff:\s+0+$/m.test(readFileSync("/proc/self/status", "utf8")))
)
  throw Error("Wrong verifier UID");
const now = () => Math.floor(Date.now() / 1000);
const external = createSimulatedExternalAuthority();
const authority = createProtectedKeyAuthority({
  readExternalDecision: external.read,
  now,
});
for (const entry of cfg.registry) {
  authority.enroll(
    external.issue({
      action: "enroll",
      owner_id: entry.owner,
      key: createPublicKey(entry.key),
      expected_version: 0,
      decision_id: `enroll-${entry.owner}`,
    }),
  );
  if (entry.rotation)
    authority.rotate({
      authorization: entry.rotation.authorization,
      nextKey: createPublicKey(entry.rotation.nextKey),
    });
  if (entry.suspended)
    authority.beginRecovery(
      external.issue({
        action: "begin-recovery",
        owner_id: entry.owner,
        expected_version: 1,
        decision_id: `suspend-${entry.owner}`,
      }),
    );
}
const replay = openReplay(cfg.database);
const verify = authority.verifier(cfg.expected);
const responseKey = createPrivateKey(cfg.responseKey);
const server = http.createServer(async (req, res) => {
  let nonce = "",
    status = 403,
    result = { accepted: false };
  try {
    const credential = Buffer.from(req.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${cfg.token}`);
    if (
      credential.length !== expected.length ||
      !timingSafeEqual(credential, expected)
    )
      throw Error("denied");
    if (req.method !== "POST" || req.url !== "/verify") throw Error("denied");
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 8192) throw Error("too large");
    }
    const input = JSON.parse(body);
    nonce = input.nonce;
    if (typeof nonce !== "string" || !/^[a-f0-9]{64}$/.test(nonce))
      throw Error("nonce");
    const intent = await verify(input.authorization);
    // SQLite uniqueness commits before an acceptance response, across restarts.
    if (!replay.consume(intent.request_id)) throw Error("replay");
    status = 200;
    result = {
      accepted: true,
      request_id: intent.request_id,
      verifier_pid: process.pid,
    };
  } catch {
    /* Uniform denial; no owner or registry details disclosed. */
  }
  const payload = JSON.stringify({ nonce, status, result });
  res.writeHead(status, {
    "content-type": "application/json",
    connection: "close",
  });
  res.end(
    JSON.stringify({
      payload,
      signature: sign(
        null,
        Buffer.from("local-verifier-response:v1\n" + payload),
        responseKey,
      ).toString("base64url"),
    }),
  );
});
server.requestTimeout = 5000;
server.headersTimeout = 5000;
server.listen(0, "127.0.0.1", () =>
  process.send({ port: server.address().port, pid: process.pid }),
);
process.on("message", (message) => {
  if (message === "stop")
    server.close(() => {
      replay.close();
      process.exit(0);
    });
});
