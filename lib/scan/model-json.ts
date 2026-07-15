export type ModelJsonErrorCode = "model_empty_response" | "model_invalid_json";

export class ModelJsonError extends Error {
  readonly code: ModelJsonErrorCode;

  constructor(code: ModelJsonErrorCode, message: string) {
    super(message);
    this.name = "ModelJsonError";
    this.code = code;
  }
}

const FENCED_JSON_BLOCK = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i;
const ANY_FENCE = /```/g;

export function parseStrictModelJson(content: string): unknown {
  const trimmed = content.trim();

  if (!trimmed) {
    throw new ModelJsonError(
      "model_empty_response",
      "Model response was empty.",
    );
  }

  const fenceCount = [...trimmed.matchAll(ANY_FENCE)].length;
  let jsonText = trimmed;

  if (fenceCount > 0) {
    if (fenceCount !== 2) {
      throw new ModelJsonError(
        "model_invalid_json",
        "Model response contained malformed or multiple JSON fences.",
      );
    }

    const match = trimmed.match(FENCED_JSON_BLOCK);
    if (!match) {
      throw new ModelJsonError(
        "model_invalid_json",
        "Model response included content outside a JSON fence.",
      );
    }

    jsonText = match[1].trim();
  }

  try {
    return JSON.parse(jsonText) as unknown;
  } catch {
    throw new ModelJsonError(
      "model_invalid_json",
      "Model response was not valid JSON.",
    );
  }
}

export function publicModelOutputError(
  code:
    | ModelJsonErrorCode
    | "model_schema_validation_failed"
    | "model_output_out_of_range",
) {
  return {
    success: false,
    error: code,
    message: "The AI response could not be safely validated. Please try again.",
  };
}
