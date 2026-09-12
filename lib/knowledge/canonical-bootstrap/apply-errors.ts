export const CANONICAL_BOOTSTRAP_TRANSACTION_FAILED = "canonical_bootstrap_transaction_failed";

const SAFE_RPC_ERROR_CODES = new Set([
  "canonical_bootstrap_preflight_failed",
  "canonical_bootstrap_identity_collision",
  "canonical_bootstrap_alias_collision",
  "canonical_bootstrap_observation_conflict",
  "canonical_bootstrap_candidate_snapshot_mismatch",
  "canonical_bootstrap_canonical_insert_failed",
  "canonical_bootstrap_ledger_insert_failed",
  "canonical_bootstrap_alias_insert_failed",
  "canonical_bootstrap_observation_link_failed",
  "canonical_bootstrap_post_link_verification_failed",
  "canonical_bootstrap_internal_integrity_failed",
]);

const SAFE_CANONICAL_INSERT_DIAGNOSTIC = /^canonical_bootstrap_canonical_insert_failed:stage=canonical_insert:sqlstate=[0-9A-Z]{5}(?::constraint=[a-z_][a-z0-9_]{0,62})?(?::table=[a-z_][a-z0-9_]{0,62})?(?::column=[a-z_][a-z0-9_]{0,62})?$/;

export function safeCanonicalBootstrapRpcError(responseBody: string): string {
  try {
    const parsed: unknown = JSON.parse(responseBody);
    if (typeof parsed === "object" && parsed !== null && "message" in parsed) {
      const message = (parsed as { message?: unknown }).message;
      if (typeof message === "string" && (SAFE_RPC_ERROR_CODES.has(message) || SAFE_CANONICAL_INSERT_DIAGNOSTIC.test(message))) return message;
    }
  } catch {
    // A malformed or non-JSON remote response is intentionally reduced to one safe code.
  }
  return CANONICAL_BOOTSTRAP_TRANSACTION_FAILED;
}
