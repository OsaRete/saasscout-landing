import "server-only";
import { AuthError, requireUser } from "@/app/api/_utils/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { ValidationServerError } from "./contracts";
import { ValidationRepository } from "./repository";
import { ValidationService } from "./service";
import {
  validationAdmission,
  validationDisabledResponse,
  ValidationReleaseDeniedError,
  VALIDATION_PRIVATE_HEADERS,
  type ValidationOperation,
} from "./release-policy";

export async function validationHandler(
  request: Request,
  action: ValidationOperation,
  operation: (service: ValidationService, ownerId: string) => Promise<unknown>,
) {
  const denied = validationAdmission(action, request.method);
  if (denied) return denied;
  try {
    const user = await requireUser(request);
    const service = new ValidationService(
      new ValidationRepository(createSupabaseAdminClient()),
    );
    return Response.json(
      { data: await operation(service, user.id) },
      { headers: VALIDATION_PRIVATE_HEADERS },
    );
  } catch (error) {
    if (error instanceof ValidationReleaseDeniedError)
      return validationDisabledResponse();
    if (error instanceof AuthError)
      return Response.json(
        {
          error: {
            code: "unauthenticated",
            message: "Authentication required.",
          },
        },
        { status: 401, headers: VALIDATION_PRIVATE_HEADERS },
      );
    if (error instanceof ValidationServerError)
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status, headers: VALIDATION_PRIVATE_HEADERS },
      );
    console.error("Validation command failed", { category: "internal_error" });
    return Response.json(
      {
        error: {
          code: "constraint_conflict",
          message: "Validation operation failed.",
        },
      },
      { status: 500, headers: VALIDATION_PRIVATE_HEADERS },
    );
  }
}
export async function body(request: Request) {
  const limit = 64_000;
  const tooLarge = () =>
    new ValidationServerError(
      413,
      "invalid_request",
      "Request body is too large.",
    );
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > limit) {
    void request.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = request.body?.getReader();
    // Retain at most the byte budget, regardless of header claims or chunk count.
    const bytes = new Uint8Array(limit);
    let size = 0;
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (chunk.value.byteLength > limit - size) {
          void reader.cancel().catch(() => {});
          throw tooLarge();
        }
        bytes.set(chunk.value, size);
        size += chunk.value.byteLength;
      }
    }
    return JSON.parse(new TextDecoder().decode(bytes.subarray(0, size)));
  } catch (error) {
    if (error instanceof ValidationServerError) throw error;
    throw new ValidationServerError(
      400,
      "invalid_request",
      "Request body must be valid JSON.",
    );
  } finally {
    reader?.releaseLock();
  }
}
