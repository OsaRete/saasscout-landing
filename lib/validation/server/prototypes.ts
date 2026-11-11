import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseAdminClient } from "@/lib/supabase/server-admin";
import {
  prototypeContent,
  prototypeFeedback,
  type PrototypeContent,
} from "../prototypes";
import {
  assertObject,
  rejectAuthorityFields,
  text,
  ValidationServerError,
} from "./contracts";
import { assertValidationOperation } from "./release-policy";
import { ownedValidationVersion } from "./resource-policy";
export const prototypeHash = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export type PrototypeDashboard = {
  page: {
    id: string;
    revision: number;
    content: PrototypeContent;
    removed: boolean;
  } | null;
  publication: { id: string; revision: number; publishedAt: string } | null;
  metrics: {
    events: number;
    browsers: number;
    submissions: number;
    screens: { screen: string; count: number }[];
    outcomes: { outcome: string; count: number }[];
  };
  submissions: {
    id: string;
    revision: number;
    outcome: string;
    comment: string;
    submitted_at: string;
  }[];
  publicPath?: string;
};
export class PrototypeService {
  constructor(private db: SupabaseAdminClient) {}
  async owner(
    ownerId: string,
    versionId: string,
    action: "read" | "save" | "publish" | "unpublish" | "remove",
    input?: unknown,
  ): Promise<PrototypeDashboard> {
    assertValidationOperation(
      `prototype.${action}`,
      action === "read" ? "GET" : "POST",
    );
    await ownedValidationVersion(
      this.db,
      ownerId,
      versionId,
      "interactive_prototype",
    );
    let content: PrototypeContent | null = null,
      revision: number | null = null;
    if (action !== "read") {
      assertObject(input);
      rejectAuthorityFields(input);
      if (!Number.isInteger(input.revision) || Number(input.revision) < 0)
        throw new ValidationServerError(
          400,
          "invalid_request",
          "Refresh before saving.",
        );
      revision = Number(input.revision);
      if (action === "save") content = prototypeContent(input.content);
    }
    const token =
      action === "publish" ? randomBytes(32).toString("base64url") : null;
    const { data, error } = await this.db.rpc("validation_prototype_owner", {
      p_owner_id: ownerId,
      p_version_id: versionId,
      p_action: action,
      p_content: content,
      p_revision: revision,
      p_token_hash: token ? prototypeHash(token) : null,
    });
    if (error || !data)
      throw new ValidationServerError(
        error?.code === "P0002" ? 404 : 409,
        error?.code === "P0002" ? "not_found" : "version_conflict",
        "The prototype changed or the action is unavailable. Refresh and check the experiment is running before publishing.",
      );
    return {
      ...(data as PrototypeDashboard),
      ...(token ? { publicPath: `/validation/prototype/${token}` } : {}),
    };
  }
  async public(
    token: string,
    action: "resolve" | "event" | "submit",
    input?: unknown,
    visitor?: string,
    network?: string,
  ) {
    assertValidationOperation(
      `prototype.${action}`,
      action === "resolve" ? "GET" : "POST",
    );
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new ValidationServerError(
        404,
        "not_found",
        "This prototype is closed or unavailable.",
      );
    let payload = null,
      requestId: string | null = null;
    if (action !== "resolve") {
      assertObject(input);
      rejectAuthorityFields(input);
      if (input.consent !== true || input.website !== "")
        throw new ValidationServerError(
          400,
          "invalid_request",
          "Explicit consent is required.",
        );
      requestId = text(input.requestId, "requestId", 36);
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
          requestId,
        )
      )
        throw new ValidationServerError(
          400,
          "invalid_request",
          "Invalid request identifier.",
        );
      payload =
        action === "submit"
          ? prototypeFeedback(input)
          : {
              screen: text(input.screen, "screen", 40),
              target:
                input.target == null ? null : text(input.target, "target", 40),
            };
      if (!visitor || !network)
        throw new ValidationServerError(
          400,
          "invalid_request",
          "Reload the page and allow its session cookie.",
        );
    }
    const { data, error } = await this.db.rpc("validation_prototype_public", {
      p_token_hash: prototypeHash(token),
      p_action: action,
      p_visitor_hash: visitor ? prototypeHash(`${token}:${visitor}`) : null,
      p_network_hash: network ? prototypeHash(`${token}:${network}`) : null,
      p_request_id: requestId,
      p_payload: payload,
      p_consent: action !== "resolve",
    });
    if (error || !data)
      throw new ValidationServerError(
        error?.code === "23505" ? 409 : 404,
        error?.code === "23505" ? "idempotency_conflict" : "not_found",
        "The prototype is unavailable or this response conflicts with a prior submission. Reload before trying again.",
      );
    if ((data as { limited?: boolean }).limited)
      throw new ValidationServerError(
        429,
        "invalid_request",
        "Too many requests. Please wait one minute.",
      );
    return data;
  }
}
