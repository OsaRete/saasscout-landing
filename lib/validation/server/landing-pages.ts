import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseAdminClient } from "@/lib/supabase/server-admin";
import {
  landingContent,
  landingEmail,
  type LandingContent,
} from "../landing-pages";
import {
  assertObject,
  rejectAuthorityFields,
  text,
  ValidationServerError,
} from "./contracts";
import { assertValidationOperation } from "./release-policy";
import { ownedValidationVersion } from "./resource-policy";
export const landingHash = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export type LandingDashboard = {
  page: { id: string; revision: number; content: LandingContent } | null;
  publication: { id: string; revision: number; publishedAt: string } | null;
  metrics: {
    views: number;
    visitors: number;
    submissions: number;
    convertedVisitors: number;
  };
  submissions: {
    id: string;
    email: string;
    consent_text: string;
    submitted_at: string;
  }[];
  publicPath?: string;
};
export class LandingService {
  constructor(private db: SupabaseAdminClient) {}
  async owner(
    ownerId: string,
    versionId: string,
    action: "read" | "save" | "publish" | "unpublish" | "remove",
    input?: unknown,
  ): Promise<LandingDashboard> {
    assertValidationOperation(
      `landing.${action}`,
      action === "read" ? "GET" : "POST",
    );
    await ownedValidationVersion(
      this.db,
      ownerId,
      versionId,
      "landing_waitlist",
    );
    let content: LandingContent | { submissionId: string } | null = null,
      revision: number | null = null;
    if (action !== "read") {
      assertObject(input);
      rejectAuthorityFields(input);
      if (!Number.isInteger(input.revision) || Number(input.revision) < 0)
        throw new ValidationServerError(
          400,
          "invalid_request",
          "Refresh the page before saving.",
        );
      revision = Number(input.revision);
      if (action === "save") content = landingContent(input.content);
      if (action === "remove")
        content = {
          submissionId: text(input.submissionId, "submissionId", 36),
        };
    }
    const token =
      action === "publish" ? randomBytes(32).toString("base64url") : null;
    const { data, error } = await this.db.rpc("validation_landing_owner", {
      p_owner_id: ownerId,
      p_version_id: versionId,
      p_action: action,
      p_content: content,
      p_revision: revision,
      p_token_hash: token ? landingHash(token) : null,
    });
    if (error || !data)
      throw new ValidationServerError(
        error?.code === "P0002" ? 404 : 409,
        error?.code === "P0002" ? "not_found" : "version_conflict",
        "The page changed or this action is unavailable. Refresh and check the experiment is running before publishing.",
      );
    return {
      ...(data as LandingDashboard),
      ...(token ? { publicPath: `/validation/landing/${token}` } : {}),
    };
  }
  async public(
    token: string,
    action: "resolve" | "view" | "submit",
    input?: unknown,
    visitor?: string,
    network?: string,
  ) {
    assertValidationOperation(
      `landing.${action}`,
      action === "resolve" ? "GET" : "POST",
    );
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new ValidationServerError(
        404,
        "not_found",
        "This page is closed or unavailable.",
      );
    let email: string | null = null,
      requestId: string | null = null;
    if (action !== "resolve") {
      assertObject(input);
      rejectAuthorityFields(input);
      if (action === "view") {
        requestId = text(input.requestId, "requestId", 36);
        if (
          !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
            requestId,
          )
        )
          throw new ValidationServerError(
            400,
            "invalid_request",
            "Invalid view request.",
          );
      } else {
        if (input.consent !== true || input.website !== "")
          throw new ValidationServerError(
            400,
            "invalid_request",
            "Explicit consent is required.",
          );
        email = landingEmail(input.email);
      }
      if (!visitor || !network)
        throw new ValidationServerError(
          400,
          "invalid_request",
          "Please reload the page and allow its session cookie.",
        );
    }
    const { data, error } = await this.db.rpc("validation_landing_public", {
      p_token_hash: landingHash(token),
      p_action: action,
      p_visitor_hash: visitor ? landingHash(`${token}:${visitor}`) : null,
      p_network_hash: network ? landingHash(`${token}:${network}`) : null,
      p_request_id: requestId,
      p_email: email,
      p_consent: action === "submit",
    });
    if (error || !data)
      throw new ValidationServerError(
        404,
        "not_found",
        "This page is closed or unavailable. Reload before trying again.",
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
