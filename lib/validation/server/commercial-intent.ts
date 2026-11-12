import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseAdminClient } from "@/lib/supabase/server-admin";
import {
  commercialIntentContent,
  commercialIntentFeedback,
  type CommercialIntentContent,
  type CommercialObjective,
} from "../commercial-intent";
import {
  assertObject,
  rejectAuthorityFields,
  text,
  ValidationServerError,
} from "./contracts";
import { assertValidationOperation } from "./release-policy";
import { ownedValidationVersion } from "./resource-policy";
export const commercialIntentHash = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export type CommercialIntentDashboard = {
  publicationState: "draft" | "published" | "unpublished";
  page: {
    id: string;
    revision: number;
    content: CommercialIntentContent;
  } | null;
  publication: { id: string; revision: number; publishedAt: string } | null;
  metrics: {
    views: number;
    submissions: number;
    contacts: number;
    outcomes: { outcome: string; count: number }[];
  };
  submissions: {
    id: string;
    revision: number;
    outcome: string;
    objective: CommercialObjective;
    answers: { question: string; answer: string }[];
    email: string | null;
    submitted_at: string;
  }[];
  publicPath?: string;
};
export class CommercialIntentService {
  constructor(private db: SupabaseAdminClient) {}
  async owner(
    ownerId: string,
    versionId: string,
    action: "read" | "save" | "publish" | "unpublish" | "remove",
    input?: unknown,
  ): Promise<CommercialIntentDashboard> {
    assertValidationOperation(
      `commercial-intent.${action}`,
      action === "read" ? "GET" : "POST",
    );
    await ownedValidationVersion(
      this.db,
      ownerId,
      versionId,
      "commercial_intent",
    );
    let content: CommercialIntentContent | { submissionId: string } | null =
        null,
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
      if (action === "save") content = commercialIntentContent(input.content);
      if (action === "remove")
        content = {
          submissionId: text(input.submissionId, "submissionId", 36),
        };
    }
    const token =
      action === "publish" ? randomBytes(32).toString("base64url") : null;
    const { data, error } = await this.db.rpc(
      "validation_commercial_intent_owner",
      {
        p_owner_id: ownerId,
        p_version_id: versionId,
        p_action: action,
        p_content: content,
        p_revision: revision,
        p_token_hash: token ? commercialIntentHash(token) : null,
      },
    );
    if (error || !data)
      throw new ValidationServerError(
        error?.code === "P0002" ? 404 : 409,
        error?.code === "P0002" ? "not_found" : "version_conflict",
        "The commercial experiment changed or the action is unavailable. Refresh and check the experiment is running before publishing.",
      );
    return {
      ...(data as CommercialIntentDashboard),
      ...(token
        ? { publicPath: `/validation/commercial-intent/${token}` }
        : {}),
    };
  }
  async public(
    token: string,
    action: "resolve" | "view" | "submit",
    input?: unknown,
    network?: string,
  ) {
    assertValidationOperation(
      `commercial-intent.${action}`,
      action === "resolve" ? "GET" : "POST",
    );
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new ValidationServerError(
        404,
        "not_found",
        "This commercial experiment is closed or unavailable.",
      );
    let payload = null,
      requestId: string | null = null;
    if (action !== "resolve") {
      assertObject(input);
      rejectAuthorityFields(input);
      if (
        (action === "submit" && input.consent !== true) ||
        input.website !== ""
      )
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
      if (action === "submit") payload = commercialIntentFeedback(input);
      if (!network)
        throw new ValidationServerError(
          400,
          "invalid_request",
          "Reload the page before submitting.",
        );
    }
    const { data, error } = await this.db.rpc(
      "validation_commercial_intent_public",
      {
        p_token_hash: commercialIntentHash(token),
        p_action: action,
        p_network_hash: network
          ? commercialIntentHash(`${token}:${network}`)
          : null,
        p_request_id: requestId,
        p_payload: payload,
        p_consent: action === "submit",
      },
    );
    if (error || !data)
      throw new ValidationServerError(
        error?.code === "23505" ? 409 : 404,
        error?.code === "23505" ? "idempotency_conflict" : "not_found",
        "The commercial experiment is unavailable or this response conflicts with a prior submission. Reload before trying again.",
      );
    if ((data as { capacity?: boolean }).capacity)
      throw new ValidationServerError(
        409,
        "constraint_conflict",
        "This test has reached its feedback limit. Please contact the creator.",
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
