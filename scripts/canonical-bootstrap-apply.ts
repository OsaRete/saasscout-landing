import { analyzeCanonicalBootstrap } from "../lib/knowledge/canonical-bootstrap/analyzer.ts";
import { buildActivationPlan, CanonicalBootstrapError } from "../lib/knowledge/canonical-bootstrap/activation-plan.ts";
import { safeCanonicalBootstrapRpcError } from "../lib/knowledge/canonical-bootstrap/apply-errors.ts";
import { createSupabaseApplyObservationReader, readUnresolvedProblemObservations } from "../lib/knowledge/canonical-bootstrap/repository.ts";

function fail(code: string): never { process.stderr.write(`${JSON.stringify({ mode: "apply", status: "failed", error: code })}\n`); process.exit(1); }
if (process.env.CANONICAL_BOOTSTRAP_APPLY !== "1") fail("canonical_bootstrap_apply_not_authorized");
const reviewedHash = process.env.CANONICAL_BOOTSTRAP_PLAN_HASH;
if (!reviewedHash) fail("canonical_bootstrap_apply_not_authorized");

try {
  // This trusted operator boundary proves semantic eligibility by rerunning B0.1/B0.1.1/B0.1.2;
  // the service-role RPC below enforces transactional database integrity, not analyzer semantics.
  const observations = await readUnresolvedProblemObservations(await createSupabaseApplyObservationReader());
  const report = analyzeCanonicalBootstrap(observations);
  const plan = buildActivationPlan(report);
  if (plan.activationPlanHash !== reviewedHash) fail("canonical_bootstrap_candidate_snapshot_mismatch");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("canonical_bootstrap_apply_not_authorized");
  const response = await fetch(new URL("/rest/v1/rpc/apply_canonical_bootstrap_activation", url), {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_plan_hash: plan.activationPlanHash, p_candidates: plan.candidates }),
  });
  if (!response.ok) fail(safeCanonicalBootstrapRpcError(await response.text()));
  const result = await response.json();
  process.stdout.write(`${JSON.stringify({ mode: "apply", ...result }, null, 2)}\n`);
} catch (error) {
  fail(error instanceof CanonicalBootstrapError ? error.code : "canonical_bootstrap_preflight_failed");
}
