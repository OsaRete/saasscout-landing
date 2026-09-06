import { AuthError, requireUser } from "@/app/api/_utils/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import {
  parseValidationDesignIntent,
  ValidationDesignError,
  ValidationDesignService,
} from "@/lib/validation/design-assistant/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const messages = {
  invalid_request: "The draft request is invalid or too large.",
  ownership_failed: "Validation context was not found.",
  unsupported_mode: "That design mode is not supported.",
  provider_configuration_missing: "AI design assistance is not configured.",
  provider_request_failed: "AI design assistance is temporarily unavailable.",
  provider_timeout: "AI design assistance timed out.",
  provider_empty_response: "AI design assistance returned no draft.",
  provider_response_parse_failed: "The AI draft could not be read safely.",
  model_output_contract_failed:
    "The AI draft did not meet the design contract.",
} as const;

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 16_000)
      throw new ValidationDesignError("invalid_request", 413);
    let value: unknown;
    try {
      value = await request.json();
    } catch {
      throw new ValidationDesignError("invalid_request", 400);
    }
    const intent = parseValidationDesignIntent(value);
    const service = new ValidationDesignService(createSupabaseAdminClient());
    return Response.json(
      { data: await service.generate(user.id, intent) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthError)
      return Response.json(
        {
          error: {
            code: "unauthenticated",
            message: "Authentication required.",
          },
        },
        { status: 401 },
      );
    const safe =
      error instanceof ValidationDesignError
        ? error
        : new ValidationDesignError("provider_request_failed", 500);
    console.error("Validation design request failed", { category: safe.code });
    return Response.json(
      { error: { code: safe.code, message: messages[safe.code] } },
      { status: safe.status },
    );
  }
}
