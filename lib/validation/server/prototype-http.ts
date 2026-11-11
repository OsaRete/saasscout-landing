import "server-only";
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { AuthError, requireUser } from "@/app/api/_utils/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { body } from "./http";
import { ValidationServerError } from "./contracts";
import { PrototypeService, prototypeHash } from "./prototypes";
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
                : "Prototype request failed.",
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
export async function prototypeOwnerHandler(
  request: Request,
  versionId: string,
  action: "read" | "save" | "publish" | "unpublish" | "remove",
) {
  const denied = validationAdmission(`prototype.${action}`, request.method);
  if (denied) return denied;
  return handle(async () => {
    const user = await requireUser(request);
    return new PrototypeService(createSupabaseAdminClient()).owner(
      user.id,
      versionId,
      action,
      action === "read" ? undefined : await body(request),
    );
  });
}
export async function prototypePublicHandler(
  request: Request,
  token: string,
  action: "resolve" | "event" | "submit",
) {
  const denied = validationAdmission(`prototype.${action}`, request.method);
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
    const service = new PrototypeService(createSupabaseAdminClient());
    if (action === "resolve") return service.public(token, action);
    // Required only for explicitly approved public activation. Never use a production secret in tests.
    const secret = process.env.VALIDATION_PROTOTYPE_COOKIE_SECRET;
    if (!secret || secret.length < 32) throw new ValidationReleaseDeniedError();
    const name = `vp_${prototypeHash(token).slice(0, 16)}`,
      jar = await cookies();
    const sign = (id: string) =>
      createHmac("sha256", secret).update(`${token}:${id}`).digest("hex");
    const stored = jar.get(name)?.value || "",
      [prior, signature] = stored.split(".");
    const valid =
      /^[a-f0-9]{32}$/.test(prior || "") &&
      /^[a-f0-9]{64}$/.test(signature || "") &&
      timingSafeEqual(Buffer.from(sign(prior)), Buffer.from(signature));
    const visitor = valid ? prior : randomBytes(16).toString("hex");
    if (action === "submit" && !valid)
      throw new ValidationServerError(
        400,
        "invalid_request",
        "Reload the page and allow its session cookie before submitting.",
      );
    const input = await body(request);
    const data = await service.public(
      token,
      action,
      input,
      visitor,
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown",
    );
    if (!valid)
      jar.set(name, `${visitor}.${sign(visitor)}`, {
        httpOnly: true,
        sameSite: "strict",
        secure: new URL(request.url).protocol === "https:",
        path: `/api/public/validation/prototype/${token}`,
        maxAge: 60 * 60 * 24 * 30,
      });
    return data;
  });
}
