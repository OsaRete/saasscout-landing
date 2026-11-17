import {
  validationAdmission,
  validationDisabledResponse,
  ValidationReleaseDeniedError,
  VALIDATION_PRIVATE_HEADERS,
} from "./release-policy";
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { ValidationServerError } from "./contracts";
import { SurveyService } from "./surveys";
export async function publicSurveyHandler(
  request: Request,
  action: "survey.resolve" | "survey.submit",
  operation: (service: SurveyService) => Promise<unknown>,
) {
  const denied = validationAdmission(action, request.method);
  if (denied) return denied;
  try {
    return Response.json(
      { data: await operation(new SurveyService(createSupabaseAdminClient())) },
      { headers: VALIDATION_PRIVATE_HEADERS },
    );
  } catch (error) {
    if (error instanceof ValidationReleaseDeniedError)
      return validationDisabledResponse();
    if (error instanceof ValidationServerError)
      return Response.json(
        {
          error: {
            code: error.code,
            message: error.message,
            ...(error.submissionRejected ? { submissionRejected: true } : {}),
          },
        },
        {
          status: error.status,
          headers: {
            ...VALIDATION_PRIVATE_HEADERS,
            ...(error.status === 429 ? { "Retry-After": "60" } : {}),
          },
        },
      );
    console.error("Public survey request failed", {
      category: "internal_error",
    });
    return Response.json(
      {
        error: {
          code: "constraint_conflict",
          message: "Survey request failed.",
        },
      },
      { status: 500, headers: VALIDATION_PRIVATE_HEADERS },
    );
  }
}
