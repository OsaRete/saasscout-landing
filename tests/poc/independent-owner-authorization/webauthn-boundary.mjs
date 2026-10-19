// Disabled synthetic composition. Registry/config/expected intent are trusted inputs.
import { createPublicKey } from "node:crypto";
import { decodeBoundIntent } from "../../../security/owner-authorization/intent-codec.ts";
import {
  deriveWebAuthnChallenge,
  verifyWebAuthnProof,
} from "../../../security/owner-authorization/webauthn-proof.ts";
import { originConfig } from "./webauthn-registration.mjs";
export function createSyntheticWebAuthnBoundary({
  registry,
  webauthn,
  now,
  enabled = false,
}) {
  if (enabled !== true || typeof now !== "function")
    throw new Error("Disabled synthetic WebAuthn boundary");
  const { origin, rpId } = originConfig(webauthn);
  return Object.freeze({
    register(evidence) {
      return registry.transition(evidence);
    },
    prove(intentBytes, assertion, expectedIntent) {
      const at = now();
      const intent = decodeBoundIntent(
        Buffer.from(intentBytes).toString("utf8"),
        expectedIntent,
        at,
      );
      return registry.consumePossession(
        {
          ownerId: intent.owner_id,
          ownerSubject: intent.owner_subject,
          credentialId: intent.credential_id,
          epoch: intent.registry_epoch,
        },
        intent.request_id,
        deriveWebAuthnChallenge(intentBytes, at).toString("base64url"),
        (snapshot) => {
          if (
            snapshot.webauthn.origin !== origin ||
            snapshot.webauthn.rpId !== rpId
          )
            throw new Error("Mismatched registry origin");
          const c = snapshot.credential;
          return verifyWebAuthnProof(intentBytes, assertion, {
            expectedIntent,
            now: now(),
            origin,
            rpId,
            registry: {
              ownerId: snapshot.ownerId,
              ownerSubject: snapshot.ownerSubject,
              epoch: snapshot.epoch,
              status: "active",
              credential: {
                id: Buffer.from(c.id, "base64url"),
                type: "public-key",
                algorithm: -7,
                publicKey: createPublicKey(c.publicKey),
                userHandle: Buffer.from(c.userHandle, "base64url"),
                status: c.status,
                epoch: c.epoch,
              },
            },
          });
        },
      );
    },
  });
}
