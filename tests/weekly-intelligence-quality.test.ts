import assert from "node:assert/strict";
import test from "node:test";
import { calculateWeeklyProblemScores, validateWeeklyModelOutput, type WeeklyEvidenceSource } from "../lib/weekly-intelligence.ts";
import { readFileSync } from "node:fs";

const evidence: WeeklyEvidenceSource[] = [
  { type: "scan", id: "scan-1", title: "Client handoff", summary: "Clients report manual handoff errors that waste time and cost revenue.", created_at: "2026-08-04T00:00:00Z" },
  { type: "discover", id: "discover-1", title: "Handoff research", summary: "Customer teams cannot complete the manual workflow before deadlines and would pay for automation.", created_at: "2026-08-05T00:00:00Z" },
];

test("Weekly scores are deterministic, evidence-derived, and reduce confidence when references are sparse", () => {
  const strong = calculateWeeklyProblemScores(["scan-1", "discover-1"], evidence);
  const limited = calculateWeeklyProblemScores(["scan-1"], evidence);
  assert.deepEqual(strong, calculateWeeklyProblemScores(["scan-1", "discover-1"], evidence));
  assert.ok(strong.confidence_score > limited.confidence_score);
  assert.equal(limited.trend_score, null);
  assert.notEqual(strong.pain_score, 5);
});

test("fallback validation rejects fabricated freshness and accepts historical references only as context", () => {
  const historical: WeeklyEvidenceSource[] = [{ type: "historical_context", id: "weekly_context_wmt_safe", title: "Recurring handoff", summary: "Previously grounded owner evidence.", created_at: "2026-07-01T00:00:00Z", provenance: "owner_scoped_historical_context" }];
  assert.throws(() => validateWeeklyModelOutput({ summary: "This week the market is increasing.", problems: [] }, historical, [], "data_moat_fallback"), /unsupported fresh-market claim/);
  const report = validateWeeklyModelOutput({ summary: "Based on your accumulated SaaSScout evidence, validate the recurring workflow.", problems: [{ problem_title: "Recurring handoff", evidence_references: ["weekly_context_wmt_safe"] }] }, historical, [], "data_moat_fallback");
  assert.equal(report.problems[0]?.evidence_references?.[0], "weekly_context_wmt_safe");
  assert.throws(() => validateWeeklyModelOutput({ summary: "Historical", problems: [{ problem_title: "Bad ref", evidence_references: ["wmt_safe"] }] }, historical, [], "data_moat_fallback"), /invalid evidence references/);
});

test("validation rejects placeholders, ungrounded references, and provider scores", () => {
  assert.throws(() => validateWeeklyModelOutput({ summary: "Grounded", problems: [{ problem_title: "", evidence_references: ["scan-1"] }] }, evidence), /missing a title/);
  assert.throws(() => validateWeeklyModelOutput({ summary: "Grounded", problems: [{ problem_title: "Specific", evidence_references: ["not-owned"] }] }, evidence), /invalid evidence references/);
  const report = validateWeeklyModelOutput({ summary: "Grounded", problems: [{ problem_title: "Client handoff errors", problem_summary: "Repeated handoff failures.", evidence_references: ["scan-1", "discover-1"], pain_score: 10 }] }, evidence);
  assert.notEqual(report.problems[0].pain_score, 10);
  assert.equal(report.problems[0].affected_niches, null);
});

test("browser uses authenticated server projection and never reads weekly_sources", () => {
  const page = readFileSync("app/weekly/page.tsx", "utf8");
  const route = readFileSync("app/api/weekly-intelligence/route.ts", "utf8");
  assert.doesNotMatch(page, /\.from\(["']weekly_sources/);
  assert.match(page, /fetch\("\/api\/weekly-intelligence"/);
  assert.match(route, /export async function GET/);
  assert.match(route, /\.eq\("user_id", user\.id\)/);
});

test("Beta stabilization supplies an inferable conflict target and server-owned mode fields", () => {
  const migration = readFileSync("supabase/migrations/20260821000000_weekly_beta_stabilization.sql", "utf8");
  const route = readFileSync("app/api/weekly-intelligence/route.ts", "utf8");
  assert.match(migration, /unique index[^;]+on public\.weekly_sources\(run_id, evidence_id\)/s);
  assert.doesNotMatch(migration, /weekly_sources\(run_id, evidence_id\)\s+where/i);
  assert.match(migration, /execution_mode.*external_provider_state.*external_sources_persisted.*source_degraded/s);
  assert.match(route, /onConflict: "run_id,evidence_id"/);
  assert.match(route, /execution_contract_version: WEEKLY_EXECUTION_CONTRACT_VERSION/);
});

test("Deep Scan projection preserves Weekly identity and provenance without placeholder values", () => {
  const page = readFileSync("app/weekly/page.tsx", "utf8");
  assert.match(page, /Weekly problem ID: \$\{problem\.id\}/);
  assert.match(page, /Evidence references:/);
  for (const placeholder of ["Untitled weekly pattern", "User explored market", "Validation follow-up", "Validate willingness to pay before building."]) assert.doesNotMatch(page, new RegExp(placeholder));
});

test("quality migration remains additive and keeps Weekly sources server-owned", () => {
  const migration = readFileSync("supabase/migrations/20260809000000_weekly_intelligence_quality_contract.sql", "utf8");
  assert.match(migration, /add column if not exists evidence_references jsonb/);
  assert.match(migration, /revoke all on table public\.weekly_sources from public, anon, authenticated/);
  assert.doesNotMatch(migration, /grant select[^;]+authenticated/);
  assert.doesNotMatch(migration, /update public\.|delete from public\./);
});
