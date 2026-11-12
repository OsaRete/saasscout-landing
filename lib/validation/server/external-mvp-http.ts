import "server-only";
import { AuthError, requireUser } from "@/app/api/_utils/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { body } from "./http";
import { ValidationServerError } from "./contracts";
import { ExternalMvpService } from "./external-mvp";
import {
  validationAdmission,
  validationDisabledResponse,
  ValidationReleaseDeniedError,
  VALIDATION_PRIVATE_HEADERS,
} from "./release-policy";
async function handle(operation: () => Promise<unknown>) {
  try {
    return Response.json(
      { data: await operation() },
      { headers: VALIDATION_PRIVATE_HEADERS },
    );
  } catch (error) {
    if (error instanceof ValidationReleaseDeniedError)
      return validationDisabledResponse();
    const status =
      error instanceof AuthError
        ? 401
        : error instanceof ValidationServerError
          ? error.status
          : 500;
    return Response.json(
      {
        error: {
          code:
            error instanceof ValidationServerError
              ? error.code
              : status === 401
                ? "unauthenticated"
                : "constraint_conflict",
          message:
            error instanceof ValidationServerError
              ? error.message
              : status === 401
                ? "Authentication required."
                : "External MVP request failed.",
        },
      },
      {
        status,
        headers: {
          ...VALIDATION_PRIVATE_HEADERS,
          ...(status === 429 ? { "Retry-After": "60" } : {}),
        },
      },
    );
  }
}
export async function externalMvpOwnerHandler(
  request: Request,
  versionId: string,
  action: "read" | "save" | "publish" | "unpublish" | "remove",
) {
  const denied = validationAdmission(`external-mvp.${action}`, request.method);
  if (denied) return denied;
  return handle(async () => {
    const user = await requireUser(request);
    return new ExternalMvpService(createSupabaseAdminClient()).owner(
      user.id,
      versionId,
      action,
      action === "read" ? undefined : await body(request),
    );
  });
}
export async function externalMvpPublicHandler(
  request: Request,
  token: string,
  action: "resolve" | "submit",
) {
  const denied = validationAdmission(`external-mvp.${action}`, request.method);
  if (denied) return denied;
  return handle(async () => {
    // Same-origin JSON POSTs only; no permissive CORS and no browser-provided network identity.
    if (
      action !== "resolve" &&
      (!request.headers.get("content-type")?.startsWith("application/json") ||
        request.headers.get("origin") !== new URL(request.url).origin)
    )
      throw new ValidationServerError(
        400,
        "invalid_request",
        "Use the form on this page.",
      );
    const service = new ExternalMvpService(createSupabaseAdminClient());
    if (action === "resolve")
      return service.public(
        token,
        action,
        undefined,
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown",
      );
    return service.public(
      token,
      action,
      await body(request),
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown",
    );
  });
}
