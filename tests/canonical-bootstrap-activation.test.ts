import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { analyzeCanonicalBootstrap } from "../lib/knowledge/canonical-bootstrap/analyzer.ts";
import { buildActivationPlan, buildCandidateSnapshot, CanonicalBootstrapError } from "../lib/knowledge/canonical-bootstrap/activation-plan.ts";
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
