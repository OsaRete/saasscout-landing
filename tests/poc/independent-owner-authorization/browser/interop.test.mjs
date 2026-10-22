// TEST ONLY. Opt-in, disposable HTTPS, no production caller or authorization.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from "node:crypto";
import { createServer } from "node:https";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import {
  openSyntheticRegistry,
  registryTransitionBytes,
  enrollmentConfirmationBytes,
} from "../durable-registry.mjs";
import { createSyntheticWebAuthnBoundary } from "../webauthn-boundary.mjs";
import {
  registrationChallenge,
  verifySyntheticRegistration,
} from "../webauthn-registration.mjs";
import { encodeIntent } from "../../../../security/owner-authorization/intent-codec.ts";
import {
  deriveWebAuthnChallenge,
  verifyWebAuthnProof,
} from "../../../../security/owner-authorization/webauthn-proof.ts";

const b64 = (v) => Buffer.from(v).toString("base64url");
const pem = (key) => key.export({ type: "spki", format: "pem" });
const ownerId = "11111111-1111-4111-8111-111111111111";
const ownerSubject = "independent:synthetic:browser";

test(
  "browser interoperability (explicit opt-in only)",
  { skip: process.env.BROWSER_WEBAUTHN_POC !== "1", timeout: 60000 },
  async (t) => {
    // No certificate/key defaults: never read application credentials.
    assert.ok(
      process.env.BROWSER_POC_CERT && process.env.BROWSER_POC_KEY,
      "Supply disposable localhost TLS certificate and key paths",
    );
    const server = createServer(
      {
        cert: readFileSync(process.env.BROWSER_POC_CERT),
        key: readFileSync(process.env.BROWSER_POC_KEY),
      },
      (_req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/html",
          "Cache-Control": "no-store",
        });
        res.end(
          "<!doctype html><title>Disposable synthetic WebAuthn POC</title>",
        );
      },
    );
    // After hooks run in registration order. Never wait on live Chromium TLS
    // sockets before the later browser.close hook can run (including on failure).
    const sockets = new Set();
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    t.after(
      () =>
        new Promise((resolve) => {
          server.close(resolve);
          server.closeAllConnections();
          // Include TLS handshakes, which closeAllConnections may not track yet.
          for (const socket of sockets) socket.destroy();
        }),
    );
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const origin = `https://localhost:${server.address().port}`;
    const config = { origin, rpId: "localhost" };
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    t.diagnostic(
      `Chromium ${browser.version()}; CDP WebAuthn CTAP2 / internal / resident / UV; Playwright ${JSON.parse(readFileSync(new URL("../../../../node_modules/@playwright/test/package.json", import.meta.url))).version}`,
    );
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    const { authenticatorId } = await cdp.send(
      "WebAuthn.addVirtualAuthenticator",
      {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      },
    );
    await page.goto(origin);
    assert.equal(await page.evaluate(() => window.isSecureContext), true);
    const roots = [
      generateKeyPairSync("ed25519"),
      generateKeyPairSync("ed25519"),
    ];
    const dir = mkdtempSync(join(tmpdir(), "browser-webauthn-"));
    let registry;
    t.after(() => {
      try {
        registry?.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
    const options = {
      path: join(dir, "registry.sqlite"),
      ownerId,
      ownerSubject,
      independentKeys: roots.map((k) => pem(k.publicKey)),
      now: () => 1050,
      enabled: true,
      webauthn: config,
    };
    registry = openSyntheticRegistry({ ...options, create: true });
    const boundary = createSyntheticWebAuthnBoundary({
      registry,
      webauthn: config,
      now: () => 1050,
      enabled: true,
    });
    const handle = b64(randomBytes(32));
    const initiation = boundary.prepareEnrollment({
      requestId: "simulated-enrollment",
      userHandle: handle,
      expiresAt: 1300,
    });
    assert.ok(!initiation.includes('"credential"'));
    const approve = (bytes) =>
      roots.map((k) => b64(sign(null, Buffer.from(bytes), k.privateKey)));
    const authorization = {
      request: initiation,
      approvals: approve(initiation),
    };
    const authorized = boundary.initiateEnrollment(authorization);
    assert.equal(authorized.request, initiation);
    const session = JSON.parse(authorized.request.split("\n")[1]);
    const createChallenge = registrationChallenge(authorized.request, "create");
    async function create(challenge, handle, target = page) {
      return target.evaluate(
        async ({ challenge, handle }) => {
          const decode = (s) =>
            Uint8Array.from(
              atob(s.replace(/-/g, "+").replace(/_/g, "/")),
              (c) => c.charCodeAt(0),
            );
          const encode = (b) =>
            btoa(String.fromCharCode(...new Uint8Array(b)))
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "");
          const c = await navigator.credentials.create({
            publicKey: {
              challenge: decode(challenge),
              rp: { id: "localhost", name: "Synthetic POC" },
              user: {
                id: decode(handle),
                name: "synthetic-owner",
                displayName: "Synthetic owner",
              },
              pubKeyCredParams: [{ type: "public-key", alg: -7 }],
              authenticatorSelection: {
                residentKey: "required",
                userVerification: "required",
              },
              attestation: "none",
              timeout: 10000,
            },
          });
          return {
            type: c.type,
            credentialId: encode(c.rawId),
            clientDataJSON: encode(c.response.clientDataJSON),
            attestationObject: encode(c.response.attestationObject),
            publicKey: encode(c.response.getPublicKey()),
          };
        },
        { challenge, handle },
      );
    }
    const created = await create(createChallenge, handle);
    const publicKey = createPublicKey({
      key: Buffer.from(created.publicKey, "base64url"),
      format: "der",
      type: "spki",
    });
    const credential = {
      id: created.credentialId,
      publicKey: pem(publicKey),
      userHandle: handle,
    };
    async function get(
      challenge,
      userVerification = "required",
      credentialId = credential.id,
      target = page,
    ) {
      const wire = await target.evaluate(
        async ({ challenge, userVerification, credentialId }) => {
          const decode = (s) =>
            Uint8Array.from(
              atob(s.replace(/-/g, "+").replace(/_/g, "/")),
              (c) => c.charCodeAt(0),
            );
          const encode = (b) =>
            b === null
              ? null
              : btoa(String.fromCharCode(...new Uint8Array(b)))
                  .replace(/\+/g, "-")
                  .replace(/\//g, "_")
                  .replace(/=+$/, "");
          const c = await navigator.credentials.get({
            publicKey: {
              rpId: "localhost",
              allowCredentials: [
                { type: "public-key", id: decode(credentialId) },
              ],
              challenge: decode(challenge),
              userVerification,
              timeout: 10000,
            },
          });
          return {
            type: c.type,
            credentialId: encode(c.rawId),
            response: {
              clientDataJSON: encode(c.response.clientDataJSON),
              authenticatorData: encode(c.response.authenticatorData),
              signature: encode(c.response.signature),
              userHandle: encode(c.response.userHandle),
            },
          };
        },
        { challenge, userVerification, credentialId },
      );
      return {
        type: wire.type,
        credentialId: Buffer.from(wire.credentialId, "base64url"),
        response: Object.fromEntries(
          Object.entries(wire.response).map(([k, v]) => [
            k,
            v === null ? null : Buffer.from(v, "base64url"),
          ]),
        ),
      };
    }
    const request = registryTransitionBytes({
      version: 1,
      action: "enroll",
      ownerId,
      ownerSubject,
      expectedEpoch: 0,
      requestId: "simulated-enrollment",
      issuedAt: session.issuedAt,
      expiresAt: 1300,
      credential,
    });
    const possession = await get(registrationChallenge(request, "get"));
    const confirmation = {
      sessionId: session.requestId,
      credential,
      approvals: approve(enrollmentConfirmationBytes(initiation, request)),
      proof: {
        type: created.type,
        credentialId: created.credentialId,
        clientDataJSON: created.clientDataJSON,
        attestationObject: created.attestationObject,
        possession: {
          credentialId: b64(possession.credentialId),
          ...Object.fromEntries(
            Object.entries(possession.response).map(([k, v]) => [
              k,
              v === null ? null : b64(v),
            ]),
          ),
        },
      },
    };
    // A new resident key for the same RP/handle replaces the old key in Chromium.
    // Give competing keys their own page/authenticator; preserve the primary key.
    const competingPage = await context.newPage();
    const competingCdp = await context.newCDPSession(competingPage);
    await competingCdp.send("WebAuthn.enable");
    await competingCdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    await competingPage.goto(origin);
    // A second real browser key has valid possession but lacks approval of its binding.
    const otherCreated = await create(createChallenge, handle, competingPage);
    const otherCredential = {
      id: otherCreated.credentialId,
      publicKey: pem(
        createPublicKey({
          key: Buffer.from(otherCreated.publicKey, "base64url"),
          format: "der",
          type: "spki",
        }),
      ),
      userHandle: handle,
    };
    const otherRequest = registryTransitionBytes({
      version: 1,
      action: "enroll",
      ownerId,
      ownerSubject,
      expectedEpoch: session.expectedEpoch,
      requestId: session.requestId,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
      credential: otherCredential,
    });
    const otherGet = await get(
      registrationChallenge(otherRequest, "get"),
      "required",
      otherCredential.id,
      competingPage,
    );
    const otherProof = {
      type: otherCreated.type,
      credentialId: otherCreated.credentialId,
      clientDataJSON: otherCreated.clientDataJSON,
      attestationObject: otherCreated.attestationObject,
      possession: {
        credentialId: b64(otherGet.credentialId),
        ...Object.fromEntries(
          Object.entries(otherGet.response).map(([k, v]) => [
            k,
            v === null ? null : b64(v),
          ]),
        ),
      },
    };
    const empty = registry.audit();
    const reject = (value, target = boundary) => {
      assert.throws(() => target.confirmEnrollment(value));
      assert.deepEqual(registry.audit(), empty);
    };
    await t.test(
      "unauthorized final approval and credential substitution",
      () => {
        reject({ ...confirmation, approvals: [] });
        reject({
          ...confirmation,
          credential: otherCredential,
          proof: otherProof,
        });
        reject({
          ...confirmation,
          credential: { ...credential, id: b64("other") },
        });
        reject({
          ...confirmation,
          credential: { ...credential, userHandle: b64("other-owner") },
        });
        reject({ ...confirmation, ownerId });
      },
    );
    await t.test(
      "tampered creation challenge and invalid possession proof",
      () => {
        const client = JSON.parse(
          Buffer.from(created.clientDataJSON, "base64url"),
        );
        client.challenge = b64(randomBytes(32));
        reject({
          ...confirmation,
          proof: {
            ...confirmation.proof,
            clientDataJSON: b64(JSON.stringify(client)),
          },
        });
        const signature = Buffer.from(
          confirmation.proof.possession.signature,
          "base64url",
        );
        signature[signature.length - 1] ^= 1;
        reject({
          ...confirmation,
          proof: {
            ...confirmation.proof,
            possession: {
              ...confirmation.proof.possession,
              signature: b64(signature),
            },
          },
        });
      },
    );
    await t.test("expired confirmation", () => {
      const expired = openSyntheticRegistry({ ...options, now: () => 1300 });
      try {
        reject(confirmation, expired);
      } finally {
        expired.close();
      }
    });
    await t.test("registration rejects incorrect origin and RP hash", () => {
      const client = JSON.parse(
        Buffer.from(created.clientDataJSON, "base64url"),
      );
      client.origin = "https://foreign.example.test";
      reject({
        ...confirmation,
        proof: {
          ...confirmation.proof,
          clientDataJSON: b64(JSON.stringify(client)),
        },
      });
      const data = Buffer.from(
        confirmation.proof.possession.authenticatorData,
        "base64url",
      );
      data[0] ^= 1;
      reject({
        ...confirmation,
        proof: {
          ...confirmation.proof,
          possession: {
            ...confirmation.proof.possession,
            authenticatorData: b64(data),
          },
        },
      });
    });
    // Prepare a competing authorized session while epoch is still zero.
    const stale = boundary.prepareEnrollment({
      requestId: "stale-session",
      userHandle: handle,
      expiresAt: 1300,
    });
    boundary.initiateEnrollment({ request: stale, approvals: approve(stale) });
    const staleSession = JSON.parse(stale.split("\n")[1]);
    const staleCreated = await create(
      registrationChallenge(stale, "create"),
      handle,
      competingPage,
    );
    const staleCredential = {
      id: staleCreated.credentialId,
      publicKey: pem(
        createPublicKey({
          key: Buffer.from(staleCreated.publicKey, "base64url"),
          format: "der",
          type: "spki",
        }),
      ),
      userHandle: handle,
    };
    const staleRequest = registryTransitionBytes({
      version: 1,
      action: "enroll",
      ownerId,
      ownerSubject,
      expectedEpoch: staleSession.expectedEpoch,
      requestId: staleSession.requestId,
      issuedAt: staleSession.issuedAt,
      expiresAt: staleSession.expiresAt,
      credential: staleCredential,
    });
    const staleGet = await get(
      registrationChallenge(staleRequest, "get"),
      "required",
      staleCredential.id,
      competingPage,
    );
    const staleConfirmation = {
      sessionId: staleSession.requestId,
      credential: staleCredential,
      approvals: approve(enrollmentConfirmationBytes(stale, staleRequest)),
      proof: {
        type: staleCreated.type,
        credentialId: staleCreated.credentialId,
        clientDataJSON: staleCreated.clientDataJSON,
        attestationObject: staleCreated.attestationObject,
        possession: {
          credentialId: b64(staleGet.credentialId),
          ...Object.fromEntries(
            Object.entries(staleGet.response).map(([k, v]) => [
              k,
              v === null ? null : b64(v),
            ]),
          ),
        },
      },
    };
    await t.test("successful raw browser two-stage enrollment", () => {
      // transition intentionally masks verification errors. Run the SAME strict
      // verifier first for a fixed, non-sensitive stage label, never a bypass.
      try {
        verifySyntheticRegistration(
          request,
          confirmation.proof,
          credential,
          config,
          initiation,
        );
      } catch (error) {
        t.diagnostic(
          `Raw browser evidence rejected: ${typeof error.code === "string" && error.code.startsWith("synthetic-registration:") ? error.code : "registration-profile"}`,
        );
        throw new Error(
          "Raw browser registration failed strict profile verification",
        );
      }
      t.diagnostic(
        "Raw registration profile accepted; checking registry confirmation",
      );
      assert.equal(
        boundary.confirmEnrollment(confirmation).productionAuthorization,
        "disabled",
      );
      const snapshot = registry.audit();
      assert.equal(snapshot.epoch, 1);
      assert.deepEqual(snapshot.credentials[0], {
        ...credential,
        status: "active",
        epoch: 1,
      });
      assert.deepEqual(snapshot.history[0].evidence.ownerProof, authorization);
    });
    // Stop after a failed positive: negative results alone cannot prove compatibility.
    assert.equal(
      registry.audit().epoch,
      1,
      "Browser enrollment must succeed before durable checks",
    );
    await t.test(
      "duplicate confirmation, stale epoch and enrollment replay after restart",
      () => {
        const before = registry.audit();
        assert.throws(() => boundary.confirmEnrollment(confirmation));
        assert.throws(() => boundary.confirmEnrollment(staleConfirmation));
        const reopened = openSyntheticRegistry(options);
        try {
          assert.deepEqual(reopened.audit(), before);
          assert.throws(() => reopened.confirmEnrollment(confirmation));
          assert.throws(() => reopened.initiateEnrollment(authorization));
        } finally {
          reopened.close();
        }
        assert.deepEqual(registry.audit(), before);
      },
    );
    // Adapter negatives below supplement the durable enrollment and proof checks.
    const intent = {
      version: 1,
      audience: "saasscout:synthetic-possession:v1",
      owner_subject: ownerSubject,
      owner_id: ownerId,
      evidence_promotion_id: "22222222-2222-4222-8222-222222222222",
      operation: "withdraw",
      revision: 0,
      registry_epoch: 1,
      credential_id: credential.id,
      request_id: randomUUID(),
      server_challenge: b64(randomBytes(32)),
      issued_at: 1000,
      expires_at: 1300,
      context_digest: "a".repeat(64),
    };
    const bytes = Buffer.from(encodeIntent(intent, 1050));
    const challenge = b64(deriveWebAuthnChallenge(bytes, 1050));
    const assertion = await get(challenge);
    const trusted = {
      expectedIntent: intent,
      now: 1050,
      ...config,
      registry: {
        ownerId,
        ownerSubject,
        epoch: 1,
        status: "active",
        credential: {
          id: Buffer.from(credential.id, "base64url"),
          type: "public-key",
          algorithm: -7,
          publicKey,
          userHandle: Buffer.from(handle, "base64url"),
          status: "active",
          epoch: 1,
        },
      },
    };
    const check = (a = assertion, c = trusted) =>
      verifyWebAuthnProof(bytes, a, c);
    await t.test("browser authentication adapter positive", () =>
      assert.equal(check().productionAuthorization, "disabled"),
    );
    for (const [name, patch] of [
      [
        "incorrect origin",
        (c) => (c.origin = `https://localhost:${server.address().port + 1}`),
      ],
      ["incorrect RP ID", (c) => (c.rpId = "other.localhost")],
      [
        "wrong owner mapping",
        (c) => (c.registry.ownerId = "44444444-4444-4444-8444-444444444444"),
      ],
      [
        "unknown credential",
        (c) => (c.registry.credential.id = Buffer.from("unknown")),
      ],
      ["revoked credential", (c) => (c.registry.credential.status = "revoked")],
      ["stale registry epoch", (c) => (c.registry.epoch = 2)],
    ])
      await t.test(name, () => {
        const c = {
          ...trusted,
          registry: {
            ...trusted.registry,
            credential: { ...trusted.registry.credential },
          },
        };
        patch(c);
        assert.throws(() => check(assertion, c), /Invalid WebAuthn proof/);
        assert.equal(check().productionAuthorization, "disabled");
      });
    await t.test("invalid challenge signed by browser", async () => {
      const wrong = await get(b64(randomBytes(32)));
      assert.throws(() => check(wrong), /Invalid WebAuthn proof/);
    });
    await t.test("tampered authenticator data and missing UP", () => {
      for (const index of [0, 32]) {
        const authenticatorData = Buffer.from(
          assertion.response.authenticatorData,
        );
        if (index === 32) authenticatorData[32] &= ~1;
        else authenticatorData[index] ^= 1;
        assert.throws(
          () =>
            check({
              ...assertion,
              response: { ...assertion.response, authenticatorData },
            }),
          /Invalid WebAuthn proof/,
        );
      }
    });
    await t.test("tampered authentication signature", () => {
      const signature = Buffer.from(assertion.response.signature);
      signature[signature.length - 1] ^= 1;
      assert.throws(
        () =>
          check({
            ...assertion,
            response: { ...assertion.response, signature },
          }),
        /Invalid WebAuthn proof/,
      );
    });
    await t.test(
      "missing required UV in actual browser assertion",
      async () => {
        await cdp.send("WebAuthn.setUserVerified", {
          authenticatorId,
          isUserVerified: false,
        });
        const a = await get(challenge, "discouraged");
        assert.equal(a.response.authenticatorData[32] & 4, 0);
        assert.throws(() => check(a), /Invalid WebAuthn proof/);
      },
    );
    await t.test(
      "durable valid authentication and replay rejection",
      async () => {
        assert.equal(
          boundary.prove(bytes, assertion, intent).productionAuthorization,
          "disabled",
        );
        assert.throws(() => boundary.prove(bytes, assertion, intent));
        const reopened = openSyntheticRegistry(options);
        try {
          const afterRestart = createSyntheticWebAuthnBoundary({
            registry: reopened,
            webauthn: config,
            now: () => 1050,
            enabled: true,
          });
          assert.throws(() => afterRestart.prove(bytes, assertion, intent));
        } finally {
          reopened.close();
        }
      },
    );
  },
);
