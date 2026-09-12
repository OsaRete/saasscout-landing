import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { analyzeCanonicalBootstrap } from "../lib/knowledge/canonical-bootstrap/analyzer.ts";
import { buildActivationPlan, buildCandidateSnapshot, CanonicalBootstrapError } from "../lib/knowledge/canonical-bootstrap/activation-plan.ts";
import { safeCanonicalBootstrapRpcError } from "../lib/knowledge/canonical-bootstrap/apply-errors.ts";
import type { BootstrapCandidateCluster, CanonicalBootstrapReport, UnresolvedProblemObservation } from "../lib/knowledge/canonical-bootstrap/types.ts";

const row = (id: string, title = "Invoice approval delays"): UnresolvedProblemObservation => ({ id, canonical_problem_id: null, observation_fingerprint: `fp-${id}`, problem_title: title,
  normalized_problem_title: title.toLowerCase(), problem_summary: null, source_table: "discovered_problems", source_row_id: id, affected_niches: [], problem_cluster: null, observed_at: null });
const eligibleReport = () => analyzeCanonicalBootstrap([row("00000000-0000-4000-8000-000000000001"), row("00000000-0000-4000-8000-000000000002")]);

test("activation plan selects only final auto-activatable candidates", () => {
  const report = analyzeCanonicalBootstrap([row("00000000-0000-4000-8000-000000000001"), row("00000000-0000-4000-8000-000000000002"), row("00000000-0000-4000-8000-000000000003", "Warehouse alerts")]);
  assert.equal(buildActivationPlan(report).eligibleCandidateCount, 1);
  assert.equal(buildActivationPlan(report).candidates[0].observationIds.length, 2);
});

test("activation plan excludes a B0.1.3-blocked candidate and changes its hash", () => {
  const report = eligibleReport();
  const original = buildActivationPlan(report);
  const blocked = { ...report.clusters[0], causeConsequenceAuditDisposition: "potential_cause_consequence_collision" as const, postCauseConsequenceActivationDisposition: "blocked_for_review" as const };
  const changed = buildActivationPlan({ ...report, clusters: [blocked] });
  assert.equal(changed.eligibleCandidateCount, 0);
  assert.notEqual(changed.activationPlanHash, original.activationPlanHash);
});

test("candidate and plan hashes are deterministic independent of report invocation", () => {
  assert.deepEqual(buildActivationPlan(eligibleReport()), buildActivationPlan(eligibleReport()));
});

test("changed observation membership changes snapshot and plan hashes", () => {
  const first = buildActivationPlan(eligibleReport());
  const changed = analyzeCanonicalBootstrap([...eligibleReport().clusters[0].observations.map((item) => row(item.id)), row("00000000-0000-4000-8000-000000000003")]);
  assert.notEqual(first.candidateSnapshotHashes[0], buildActivationPlan(changed).candidateSnapshotHashes[0]);
  assert.notEqual(first.activationPlanHash, buildActivationPlan(changed).activationPlanHash);
});

test("changed alias set changes candidate snapshot hash", () => {
  const report = eligibleReport();
  const candidate = report.clusters[0];
  const changed = { ...candidate, aliasesPreview: [...candidate.aliasesPreview, { text: "Approval delays", normalizedAlias: "approval delays", kind: "original_title" as const }] };
  assert.notEqual(buildCandidateSnapshot(candidate, report).candidateSnapshotHash, buildCandidateSnapshot(changed, report).candidateSnapshotHash);
});

test("collision-group membership fails eligibility even when disposition is forged auto", () => {
  const report = eligibleReport();
  const item = report.clusters[0];
  const forged: CanonicalBootstrapReport = { ...report, crossCandidateIdentityAudit: { ...report.crossCandidateIdentityAudit, potentialCollisionGroups: [[item.candidateId]] } };
  assert.throws(() => buildCandidateSnapshot(item, forged), (error) => error instanceof CanonicalBootstrapError && error.code === "canonical_bootstrap_preflight_failed");
});

test("review, singleton, calibrated-blocked and audited-collision candidates are excluded", () => {
  const report = eligibleReport();
  const base = report.clusters[0];
  const variants: BootstrapCandidateCluster[] = [
    { ...base, candidateId: "review", disposition: "review_required", finalActivationDisposition: "blocked_for_review", postCauseConsequenceActivationDisposition: "blocked_for_review" },
    { ...base, candidateId: "singleton", disposition: "singleton", observations: [base.observations[0]], finalActivationDisposition: "blocked_for_review", postCauseConsequenceActivationDisposition: "blocked_for_review" },
    { ...base, candidateId: "calibrated", baseActivationDisposition: "blocked_for_review", activationDisposition: "blocked_for_review", finalActivationDisposition: "blocked_for_review", postCauseConsequenceActivationDisposition: "blocked_for_review" },
    { ...base, candidateId: "audited", crossCandidateAuditDisposition: "potential_canonical_collision", finalActivationDisposition: "blocked_for_review", postCauseConsequenceActivationDisposition: "blocked_for_review" },
  ];
  assert.equal(buildActivationPlan({ ...report, clusters: variants }).eligibleCandidateCount, 0);
});

test("apply boundary is acknowledged, service-role-only, atomic and limited to registry tables", async () => {
  const [script, migration] = await Promise.all([
    readFile(new URL("../scripts/canonical-bootstrap-apply.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260912000000_controlled_canonical_bootstrap_activation.sql", import.meta.url), "utf8"),
  ]);
  assert.match(script, /CANONICAL_BOOTSTRAP_APPLY/);
  assert.match(script, /CANONICAL_BOOTSTRAP_PLAN_HASH/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /revoke all on function[\s\S]*public, anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]*service_role/);
  assert.doesNotMatch(`${script}\n${migration}`, /openrouter|openai|problem_intelligence|problem_evolution_snapshots|validation_evidence/i);
});

test("dry-run stays read-only and reports the activation plan", async () => {
  const script = await readFile(new URL("../scripts/canonical-bootstrap-dry-run.ts", import.meta.url), "utf8");
  assert.match(script, /buildActivationPlan/);
  assert.doesNotMatch(script, /method:\s*["']POST|\.rpc\(|CANONICAL_BOOTSTRAP_APPLY/);
});

test("RPC rejects duplicate candidate and observation membership before mutation", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260912000000_controlled_canonical_bootstrap_activation.sql", import.meta.url), "utf8");
  const preflight = migration.slice(migration.indexOf("perform pg_advisory_xact_lock"), migration.indexOf("-- Global preflight"));
  const mutation = migration.indexOf("insert into public.canonical_problems");
  assert.match(preflight, /group by c->>'candidateId' having count\(\*\) > 1/);
  assert.match(preflight, /jsonb_array_elements_text\(c->'observationIds'\)[\s\S]*group by observation_id having count\(\*\) > 1/);
  assert.match(preflight, /canonical_bootstrap_observation_conflict/);
  assert.ok(migration.indexOf("group by observation_id") < mutation, "membership check must precede every registry mutation");
});

test("RPC verifies exact final observation ownership and counts only legitimate reuse", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260912000000_controlled_canonical_bootstrap_activation.sql", import.meta.url), "utf8");
  assert.match(migration, /select count\(\*\) into already_owned[\s\S]*canonical_problem_id = canonical_id/);
  assert.match(migration, /select count\(\*\) into verified[\s\S]*canonical_problem_id = canonical_id/);
  assert.match(migration, /if verified <> expected then[\s\S]*canonical_bootstrap_observation_conflict/);
  assert.match(migration, /already_linked := already_linked \+ already_owned/);
  assert.doesNotMatch(migration, /already_linked := already_linked \+ expected - affected/);
});

test("duplicate-membership defenses stay inside the atomic RPC transaction", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260912000000_controlled_canonical_bootstrap_activation.sql", import.meta.url), "utf8");
  assert.match(migration, /create or replace function public\.apply_canonical_bootstrap_activation[\s\S]*begin[\s\S]*pg_advisory_xact_lock[\s\S]*exception when others/);
  assert.doesNotMatch(migration, /\bcommit\b|\brollback\b/i);
});

test("apply CLI preserves only allowlisted RPC errors", () => {
  assert.equal(safeCanonicalBootstrapRpcError(JSON.stringify({ message: "canonical_bootstrap_alias_insert_failed", details: "private row data" })), "canonical_bootstrap_alias_insert_failed");
  assert.equal(safeCanonicalBootstrapRpcError(JSON.stringify({ message: "canonical_bootstrap_observation_conflict" })), "canonical_bootstrap_observation_conflict");
});

test("apply CLI reduces malformed, unknown, and non-canonical RPC bodies to the generic error", () => {
  for (const body of ["not-json", JSON.stringify({ message: "canonical_bootstrap_attacker_chosen" }), JSON.stringify({ message: "relation secret_table failed" })]) {
    assert.equal(safeCanonicalBootstrapRpcError(body), "canonical_bootstrap_transaction_failed");
  }
});

test("B0.2.1 migration corrects JSON string UUID extraction and preserves the RPC safety boundary", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260912010000_canonical_bootstrap_apply_diagnostics.sql", import.meta.url), "utf8");
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog, public/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /jsonb_array_elements_text\(candidate->'observationIds'\)/);
  assert.doesNotMatch(migration, /value::text::uuid/);
  assert.match(migration, /if verified <> expected then[\s\S]*canonical_bootstrap_observation_conflict/);
  assert.match(migration, /exception when others then[\s\S]*case failure_stage/);
  assert.doesNotMatch(migration, /message\s*=\s*sqlerrm/);
  assert.match(migration, /revoke all on function[\s\S]*public, anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]*service_role/);
  assert.doesNotMatch(migration, /\bcommit\b|\brollback\b/i);
});

test("B0.2.1 diagnostics keep the reviewed five-candidate incident contract unchanged", async () => {
  const documentation = await readFile(new URL("../docs/CANONICAL_REGISTRY_BOOTSTRAP.md", import.meta.url), "utf8");
  for (const candidateId of [
    "cb1_1e47593fd365ef352633eab6",
    "cb1_2e74cc331b42c9b041a22d40",
    "cb1_3f4b214a7fbbf2f43e201eaa",
    "cb1_62263ef1cb13f093024925cf",
    "cb1_e12233fe75f9f0099d11a3d9",
  ]) assert.match(documentation, new RegExp(candidateId));
  assert.match(documentation, /cb1_9a2d319d26e902747fbcbf7a[\s\S]*remains blocked/);
  assert.match(documentation, /2b389d4e0d7c3854e3dd3eb4f96c7ebfb5687b43b531fa30f96eaad4964c7392/);
});

test("B0.2.2 exposes only bounded canonical insert diagnostics", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260912020000_safe_canonical_insert_failure_diagnostics.sql", import.meta.url), "utf8");
  const insertBoundary = migration.slice(migration.indexOf("failure_stage := 'canonical_insert'"), migration.indexOf("failure_stage := 'ledger_insert'"));
  const diagnosticHandler = insertBoundary.slice(insertBoundary.indexOf("exception when others then"));

  assert.match(insertBoundary, /exception when others then\s+get stacked diagnostics/);
  assert.match(insertBoundary, /diagnostic_sqlstate = returned_sqlstate/);
  assert.match(insertBoundary, /diagnostic_constraint = constraint_name/);
  assert.match(insertBoundary, /diagnostic_table = table_name/);
  assert.match(insertBoundary, /diagnostic_column = column_name/);
  assert.match(insertBoundary, /stage=canonical_insert/);
  assert.match(insertBoundary, /\^\[a-z_\]\[a-z0-9_\]\{0,62\}\$/);
  assert.doesNotMatch(diagnosticHandler, /message_text|pg_exception_detail|pg_exception_hint|pg_exception_context/i);
  assert.doesNotMatch(diagnosticHandler, /candidateCanonicalTitle|candidateNormalizedTitle|observationIds|source_evidence|source_url/);
});

test("B0.2.2 apply error parser accepts safe structural diagnostics", () => {
  assert.equal(
    safeCanonicalBootstrapRpcError(JSON.stringify({
      message: "canonical_bootstrap_canonical_insert_failed:stage=canonical_insert:sqlstate=23514:constraint=canonical_problems_status_check:table=canonical_problems:column=status",
      details: "candidate title must never escape",
      hint: "private hint",
    })),
    "canonical_bootstrap_canonical_insert_failed:stage=canonical_insert:sqlstate=23514:constraint=canonical_problems_status_check:table=canonical_problems:column=status",
  );
  assert.equal(
    safeCanonicalBootstrapRpcError(JSON.stringify({ message: "canonical_bootstrap_canonical_insert_failed:stage=canonical_insert:sqlstate=XXXXX" })),
    "canonical_bootstrap_canonical_insert_failed:stage=canonical_insert:sqlstate=XXXXX",
  );
});

test("B0.2.2 apply error parser rejects unbounded or malformed diagnostics", () => {
  for (const message of [
    "canonical_bootstrap_canonical_insert_failed:stage=canonical_insert:sqlstate=23514:constraint=bad-name",
    "canonical_bootstrap_canonical_insert_failed:stage=canonical_insert:sqlstate=23514:constraint=ok_name:detail=private",
    "canonical_bootstrap_canonical_insert_failed:stage=canonical_insert:sqlstate=23514:table=CanonicalProblems",
    `canonical_bootstrap_canonical_insert_failed:stage=canonical_insert:sqlstate=23514:column=${"a".repeat(64)}`,
    "canonical_bootstrap_canonical_insert_failed:stage=alias_insert:sqlstate=23514",
    "canonical_bootstrap_canonical_insert_failed:stage=canonical_insert:sqlstate=not-safe",
  ]) {
    assert.equal(safeCanonicalBootstrapRpcError(JSON.stringify({ message })), "canonical_bootstrap_transaction_failed");
  }
});

test("B0.2.2 canonical insert failures abort before all later mutation stages", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260912020000_safe_canonical_insert_failure_diagnostics.sql", import.meta.url), "utf8");
  const insertBoundaryStart = migration.indexOf("failure_stage := 'canonical_insert'");
  const insertFailureRaise = migration.indexOf("raise exception using errcode = 'P0001', message = safe_diagnostic", insertBoundaryStart);
  const ledgerInsert = migration.indexOf("insert into public.canonical_bootstrap_activations", insertBoundaryStart);
  const aliasInsert = migration.indexOf("insert into public.problem_aliases", insertBoundaryStart);
  const observationUpdate = migration.indexOf("update public.problem_observations", insertBoundaryStart);

  assert.ok(insertBoundaryStart >= 0 && insertFailureRaise > insertBoundaryStart);
  assert.ok(insertFailureRaise < ledgerInsert && ledgerInsert < aliasInsert && aliasInsert < observationUpdate);
  assert.match(migration, /create or replace function[\s\S]*begin[\s\S]*exception when others then/);
  assert.doesNotMatch(migration, /\bcommit\b|\brollback\b/i);
});

test("B0.2.2 preserves authority, eligibility, ownership, and successful response contracts", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260912020000_safe_canonical_insert_failure_diagnostics.sql", import.meta.url), "utf8");
  for (const invariant of [
    /security definer[\s\S]*set search_path = pg_catalog, public/,
    /pg_advisory_xact_lock/,
    /baseActivationDisposition' <> 'auto_activatable'/,
    /crossCandidateAuditDisposition' <> 'clearly_unique'/,
    /finalActivationDisposition' <> 'auto_activatable'/,
    /candidate_snapshot_hash <> candidate->>'candidateSnapshotHash'/,
    /group by observation_id having count\(\*\) > 1/,
    /if verified <> expected then[\s\S]*canonical_bootstrap_observation_conflict/,
    /return jsonb_build_object\([\s\S]*observationsAlreadyLinked[\s\S]*already_applied/,
    /revoke all on function[\s\S]*public, anon, authenticated/,
    /grant execute[\s\S]*service_role/,
  ]) assert.match(migration, invariant);
  assert.doesNotMatch(migration, /openrouter|openai|embedding|https?:\/\//i);
});

test("B0.2.3 constructs canonical keys as explicit text without JSON operator ambiguity", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260912030000_fix_canonical_bootstrap_key_construction.sql", import.meta.url), "utf8");
  const canonicalInsert = migration.slice(
    migration.indexOf("insert into public.canonical_problems"),
    migration.indexOf("insert into public.canonical_bootstrap_activations"),
  );

  assert.match(canonicalInsert, /pg_catalog\.concat\(\s*'bootstrap:',\s*candidate->>'bootstrapRuleVersion',\s*':',\s*candidate->>'candidateId'\s*\)/);
  assert.doesNotMatch(canonicalInsert, /'bootstrap:'\s*\|\|\s*candidate->>'bootstrapRuleVersion'/);

  const candidate = { bootstrapRuleVersion: "canonical_bootstrap_v1", candidateId: "cb1_1e47593fd365ef352633eab6" };
  assert.equal(
    ["bootstrap:", candidate.bootstrapRuleVersion, ":", candidate.candidateId].join(""),
    "bootstrap:canonical_bootstrap_v1:cb1_1e47593fd365ef352633eab6",
  );
});
