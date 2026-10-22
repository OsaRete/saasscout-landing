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
} from "../durable-registry.mjs";
import { createSyntheticWebAuthnBoundary } from "../webauthn-boundary.mjs";
import { registrationChallenge } from "../webauthn-registration.mjs";
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
    t.after(() => new Promise((resolve) => server.close(resolve)));
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
    // The registration challenge cannot bind the not-yet-generated browser key/ID.
    // Retain raw bytes and expose this incompatibility; never rewrite the ceremony.
    const createChallenge = b64(randomBytes(32));
    const handle = b64(randomBytes(32));
    const created = await page.evaluate(
      async ({ challenge, handle }) => {
        const decode = (s) =>
          Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
            c.charCodeAt(0),
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
      { challenge: createChallenge, handle },
    );
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
    async function get(challenge, userVerification = "required") {
      const wire = await page.evaluate(
        async ({ challenge, userVerification }) => {
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
        { challenge, userVerification },
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
    const roots = [
      generateKeyPairSync("ed25519"),
      generateKeyPairSync("ed25519"),
    ];
    const dir = mkdtempSync(join(tmpdir(), "browser-webauthn-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const registry = openSyntheticRegistry({
      path: join(dir, "registry.sqlite"),
      ownerId,
      ownerSubject,
      independentKeys: roots.map((k) => pem(k.publicKey)),
      now: () => 1050,
      enabled: true,
      create: true,
      webauthn: config,
    });
    t.after(() => registry.close());
    const boundary = createSyntheticWebAuthnBoundary({
      registry,
      webauthn: config,
      now: () => 1050,
      enabled: true,
    });
    const request = registryTransitionBytes({
      version: 1,
      action: "enroll",
      ownerId,
      ownerSubject,
      expectedEpoch: 0,
      requestId: "simulated-enrollment",
      issuedAt: 1000,
      expiresAt: 1300,
      credential,
    });
    const possession = await get(registrationChallenge(request, "get"));
    const evidence = {
      request,
      approvals: roots.map((k) =>
        b64(sign(null, Buffer.from(request), k.privateKey)),
      ),
      ownerProof: null,
      possession: {
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
    let enrolled = false;
    await t.test(
      "valid browser registration into durable boundary (known protocol blocker)",
      () => {
        assert.equal(
          createChallenge,
          registrationChallenge(request, "create"),
          "B2.12 requires create challenge to include newly generated key/ID: protocol redesign required; raw response is not rewritten",
        );
        boundary.register(evidence);
        enrolled = true;
      },
    );
    await t.test(
      "raw registration rejection leaves immutable history empty",
      () => {
        assert.throws(() => boundary.register(evidence));
        assert.equal(registry.audit().epoch, 0);
        assert.equal(registry.audit().history.length, 0);
      },
    );
    // Adapter-only context is explicitly simulated, NOT a durable enrollment.
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
    await t.test("browser authentication adapter only; simulated mapping", () =>
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
      {
        skip:
          !enrolled &&
          "NOT EXECUTED: browser enrollment blocked by B2.12 challenge protocol",
      },
      async () => {
        assert.equal(
          boundary.prove(bytes, assertion, intent).productionAuthorization,
          "disabled",
        );
        assert.throws(() => boundary.prove(bytes, assertion, intent));
      },
    );
  },
);
