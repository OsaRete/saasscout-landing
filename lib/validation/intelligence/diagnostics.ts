export const VALIDATION_INTELLIGENCE_MODEL = "openai/gpt-4.1-mini";

export type ValidationIntelligenceFailurePhase =
  "provider_request" | "model_output_contract" | "persistence_completion";
export type ValidationIntelligenceFailureCategory =
  | "provider_configuration_missing"
  | "provider_request_rejected"
  | "provider_rate_limited"
  | "provider_server_error"
  | "provider_timeout"
  | "provider_transport_error"
  | "provider_empty_response"
  | "provider_response_parse_failed"
  | "model_output_contract_failed"
  | "persistence_completion_failed";
type SafeFailureDiagnostic = {
  failureCategory: ValidationIntelligenceFailureCategory;
  provider: "openrouter";
  model: typeof VALIDATION_INTELLIGENCE_MODEL;
  elapsedMs: number;
  httpStatus?: number;
};

export function buildSafeFailureDiagnostic(
  error: unknown,
  phase: ValidationIntelligenceFailurePhase,
  elapsedMs: number,
): SafeFailureDiagnostic {
  const details =
    error && typeof error === "object"
      ? (error as { name?: unknown; code?: unknown; status?: unknown })
      : {};
  const status =
    typeof details.status === "number" &&
    details.status >= 400 &&
    details.status <= 599
      ? details.status
      : undefined;
  const name = typeof details.name === "string" ? details.name : "";
  const code = typeof details.code === "string" ? details.code : "";
  const message = error instanceof Error ? error.message : "";
  let failureCategory: ValidationIntelligenceFailureCategory;
  if (phase === "persistence_completion")
    failureCategory = "persistence_completion_failed";
  else if (phase === "model_output_contract")
    failureCategory = "model_output_contract_failed";
  else if (message === "provider_not_configured")
    failureCategory = "provider_configuration_missing";
  else if (message === "empty_model_output")
    failureCategory = "provider_empty_response";
  else if (error instanceof SyntaxError)
    failureCategory = "provider_response_parse_failed";
  else if (status === 429) failureCategory = "provider_rate_limited";
  else if (status && status >= 500) failureCategory = "provider_server_error";
  else if (status) failureCategory = "provider_request_rejected";
  else if (
    /timeout/i.test(name) ||
    /timeout/i.test(code) ||
    name === "AbortError" ||
    code === "ABORT_ERR"
  )
    failureCategory = "provider_timeout";
  else failureCategory = "provider_transport_error";
  return {
    failureCategory,
    provider: "openrouter",
    model: VALIDATION_INTELLIGENCE_MODEL,
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
    ...(status ? { httpStatus: status } : {}),
  };
}
