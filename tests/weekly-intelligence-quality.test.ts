import assert from "node:assert/strict";
import test from "node:test";
import { buildWeeklyIntelligencePrompt, calculateWeeklyProblemScores, validateWeeklyModelOutput, WEEKLY_SOLUTION_TYPES, type WeeklyEvidenceSource } from "../lib/weekly-intelligence.ts";
import { weeklyCoverageLabel, weeklySourceCountLabels } from "../lib/weekly-presentation.ts";
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

const qualityProblem = (overrides: Record<string, unknown> = {}) => ({
  problem_title: "Proof-of-work trust breaks at agency handoffs",
  problem_summary: "Agencies struggle to show clients progress without invasive activity tracking.",
  underlying_cause: "Billing accountability is coupled to surveillance rather than delivery milestones.",
  affected_users: "Small agencies and their clients", affected_niches: "Client services",
  business_impact: "Manual evidence preparation delays invoices and client approvals.",
  existing_workaround: "Teams assemble screenshots and time logs before invoicing.",
  why_existing_solutions_fail: "Time trackers prove activity but create surveillance friction.",
  observed_evidence: "Multiple current signals describe manual proof and client visibility needs.",
  repeated_pattern: "Visibility is reconstructed at billing time.",
  commercial_signal: { type: "indirect_commercial_signal", rationale: "Invoice delays and manual preparation indicate an economic cost; direct buying evidence is absent." },
  novelty: "new_angle_on_known_problem",
  best_opportunity: { solution_type: "productized_service", title: "Milestone evidence setup", short_description: "Configure a proof-of-work process around client milestones.", why_it_fits: "The gap includes process design and trust, not only software.", monetization_model: "Fixed setup fee", rationale: "Combines visibility demand with surveillance resistance.", evidence_basis: "inferred" },
  alternative_opportunities: [{ solution_type: "plugin", title: "Delivery proof plugin", short_description: "Attach approved work artifacts to invoices.", why_it_fits: "Works inside an existing billing workflow.", monetization_model: "Per-team subscription", rationale: "Reduces the handoff without replacing core tools.", evidence_basis: "inferred" }],
  monetization_angle: "Charge the agency for faster approvals; validate pricing because no direct buying signal is present.",
  recommended_validation: "Interview agency owners about delayed invoice approvals.", recommended_deep_scan: "Test milestone proof workflows and buyer objections.",
  evidence_references: ["scan-1", "discover-1"], ...overrides,
});

test("quality contract keeps symptom, non-generic root cause, workaround, gap, and inferred non-SaaS opportunity distinct", () => {
  const report = validateWeeklyModelOutput({ summary: "Grounded opportunity synthesis.", problems: [qualityProblem()] }, evidence, [], "mixed");
  const problem = report.problems[0];
  assert.match(problem.repeated_patterns || "", /Root cause: Billing accountability/);
  assert.match(problem.why_existing_tools_fail || "", /Current workaround: Teams assemble/);
  assert.match(problem.why_existing_tools_fail || "", /Solution gap: Time trackers/);
  assert.match(problem.suggested_mvp || "", /^productized_service:/);
  assert.match(problem.suggested_solutions || "", /^plugin:/);
});

test("quality contract permits every controlled solution class and does not force software", () => {
  assert.ok(WEEKLY_SOLUTION_TYPES.includes("productized_service"));
  for (const solution_type of ["plugin", "api", "marketplace", "physical_product"] as const) {
    const problem = qualityProblem({ best_opportunity: { ...(qualityProblem().best_opportunity as object), solution_type } });
    assert.equal(validateWeeklyModelOutput({ summary: "Grounded.", problems: [problem] }, evidence, [], "mixed").problems.length, 1);
  }
});

test("quality contract rejects generic/duplicate problems, unsupported buying claims, and single-reference inference", () => {
  assert.throws(() => validateWeeklyModelOutput({ summary: "Grounded.", problems: [qualityProblem({ problem_title: "Businesses have workflow inefficiencies." })] }, evidence, [], "mixed"), /too generic/);
  assert.throws(() => validateWeeklyModelOutput({ summary: "Grounded.", problems: [qualityProblem(), qualityProblem({ problem_title: "Agency handoff proof breaks client trust" })] }, evidence, [], "mixed"), /duplicate/);
  assert.throws(() => validateWeeklyModelOutput({ summary: "Grounded.", problems: [qualityProblem({ commercial_signal: { type: "direct_buying_signal", rationale: "They will pay." } })] }, evidence.map((item) => ({ ...item, summary: "Manual handoff friction before deadlines." })), [], "mixed"), /unsupported willingness-to-pay/);
  assert.throws(() => validateWeeklyModelOutput({ summary: "Grounded.", problems: [qualityProblem({ evidence_references: ["scan-1"] })] }, evidence, [], "mixed"), /multiple evidence/);
});

test("unsupported solution gaps remain omitted and history can frame novelty without becoming fresh evidence", () => {
  const report = validateWeeklyModelOutput({ summary: "Grounded.", problems: [qualityProblem({ existing_workaround: null, why_existing_solutions_fail: null })] }, evidence, [], "mixed");
  assert.equal(report.problems[0].why_existing_tools_fail, null);
  const prompt = buildWeeklyIntelligencePrompt({ period: { period_start: "2026-08-17T00:00:00.000Z", period_end: "2026-08-24T00:00:00.000Z", timezone: "UTC", boundary: "[start,end)" }, userEvidence: evidence, priorUserContext: [{ ...evidence[0], id: "history-private" }], sharedContext: [], executionMode: "mixed" });
  assert.match(prompt, /new angle on a known problem/);
  assert.doesNotMatch(prompt, /"evidenceId":"history-private"/);
});

test("current source counts and final-run coverage labels are unambiguous", () => {
  const current = { execution_contract_version: "weekly-execution@1", external_provider_state: "healthy", source_degraded: true, external_sources_persisted: 40, total_sources_analyzed: 20 };
  assert.equal(weeklyCoverageLabel(current), "Healthy");
  assert.deepEqual(weeklySourceCountLabels(current), { history: "40 collected · 20 used", collected: "40 external sources collected", used: "20 strongest signals used for this report" });
  assert.equal(weeklyCoverageLabel({ ...current, external_provider_state: "degraded" }), "Degraded");
  assert.equal(weeklyCoverageLabel({ execution_contract_version: "weekly-execution@1", execution_mode: "data_moat_fallback", external_provider_state: "unavailable" }), "Data Moat fallback");
  assert.equal(weeklyCoverageLabel({ total_sources_analyzed: 9 }), "Legacy / unknown");
});

test("completed reuse copy is explicit and avoids a reload that implies new work", () => {
  const page = readFileSync("app/weekly/page.tsx", "utf8");
  assert.match(page, /already up to date\. You're viewing the completed report for this week; no new analysis was required/);
  assert.match(page, /weekly_current_period_reused" \|\| result\.reused\) return/);
});
