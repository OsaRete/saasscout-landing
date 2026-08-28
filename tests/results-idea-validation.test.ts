import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildResultsIdeaValidationView } from "../lib/results/idea-validation-presentation.ts";
import type { PublicIdeaValidationResponse } from "../lib/idea-validation/engine.ts";

const resultsPage = () => readFileSync(new URL("../app/results/page.tsx", import.meta.url), "utf8");
const route = () => readFileSync(new URL("../app/api/results/idea-validation/route.ts", import.meta.url), "utf8");
const appShell = () => readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");

test("Results consumes Evidence Alignment through the compatible Idea Validation API boundary", () => {
  assert.match(resultsPage(), /\/api\/results\/idea-validation/);
  assert.match(route(), /aggregateUserDataMoat\(/);
  assert.match(route(), /validateIdeaAgainstDataMoatContext\(/);
  assert.doesNotMatch(route(), /validateIdea\(/);
  assert.match(route(), /stripIdeaValidationDiagnostics/);
});

test("Results no longer presents legacy confidence_score as opportunity validation confidence", () => {
  const source = resultsPage();
  assert.doesNotMatch(source, /label="Confidence"/);
  assert.doesNotMatch(source, /confidence_score \|\| 7/);
  assert.match(source, /Engine Confidence/);
});

test("Results presents internal engine output as Evidence Alignment", () => {
  const source = resultsPage();
  assert.match(source, /validation\.supportingSignals/);
  assert.match(source, /validation\.contradictorySignals/);
  assert.match(source, /Evidence Alignment/);
  assert.match(source, /Supporting signals/);
  assert.match(source, /Contradictory signals/);
  assert.doesNotMatch(source, /Idea Validation Engine/);
  assert.doesNotMatch(source, /label="Validation"/);
  assert.doesNotMatch(source, /Validated opportunity intelligence/);
});

test("Results explicitly distinguishes internal alignment from real-world customer validation", () => {
  const source = resultsPage();
  assert.match(source, /Evidence Alignment measures how strongly an idea aligns with market intelligence SaaSScout already has\./);
  assert.match(source, /This is internal evidence alignment, not real-world customer validation\./);
  assert.doesNotMatch(source, /href=["']\/validation/);
});

test("Results validation endpoint keeps diagnostics internal and uses user-scoped read-only evidence", () => {
  const source = route();
  assert.match(source, /requireUser\(req\)/);
  assert.match(source, /includeSharedContext: false/);
  assert.match(source, /RESULTS_IDEA_VALIDATION_MAX_IDEAS/);
  assert.match(source, /stripIdeaValidationDiagnostics\(validateIdeaAgainstDataMoatContext/);
  assert.doesNotMatch(source, /diagnostics:/);
  assert.doesNotMatch(source, /\.insert\(/);
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /\.upsert\(/);
  assert.doesNotMatch(source, /\.delete\(/);
});

test("Results validation presentation is deterministic and compatible with existing layout badges", () => {
  const validation: PublicIdeaValidationResponse = {
    status: "promising",
    confidence: 62.25,
    evidenceSummary: "2 supporting and 0 contradictory related signals.",
    supportingSignals: [],
    contradictorySignals: [],
    explanation: "Deterministic engine output.",
    freshness: { latestEvidenceAt: "2026-07-20T00:00:00.000Z", ageDays: 1, level: "fresh" },
    recommendation: "run_deep_scan",
  };

  assert.deepEqual(buildResultsIdeaValidationView(validation), buildResultsIdeaValidationView(validation));
  assert.deepEqual(buildResultsIdeaValidationView(validation), {
    confidenceLabel: "62.3%",
    statusLabel: "Moderate alignment",
    recommendationLabel: "Run deep scan",
    recommendationText: "Internal evidence is moderately aligned but not conclusive. Run a deeper scan to strengthen or challenge the opportunity.",
    tone: "cyan",
  });
});

test("internal statuses map to non-overstated Evidence Alignment labels", () => {
  const base: PublicIdeaValidationResponse = {
    status: "validated",
    confidence: 80,
    evidenceSummary: "Internal evidence only.",
    supportingSignals: [],
    contradictorySignals: [],
    explanation: "Deterministic engine output.",
    freshness: { latestEvidenceAt: null, ageDays: null, level: "none" },
    recommendation: "prioritize_beta_validation",
  };
  const labels = Object.fromEntries(
    (["validated", "promising", "weak", "contradicted", "insufficient_evidence"] as const)
      .map((status) => [status, buildResultsIdeaValidationView({ ...base, status }).statusLabel]),
  );

  assert.deepEqual(labels, {
    validated: "Strong alignment",
    promising: "Moderate alignment",
    weak: "Weak alignment",
    contradicted: "Contradictory evidence",
    insufficient_evidence: "Insufficient internal evidence",
  });
  assert.equal(buildResultsIdeaValidationView(base).recommendationLabel, "Prioritize customer research");
});

test("V0 adds neither a future Validation route nor a sidebar destination", () => {
  assert.doesNotMatch(appShell(), /href=["']\/validation/);
  assert.doesNotMatch(appShell(), />\s*Idea Validation\s*</);
});

test("compatible endpoint remains deterministic, read-only, and provider-independent", () => {
  const source = route();
  assert.doesNotMatch(source, /openai|anthropic|generateText|streamText/i);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.match(source, /POST\(req: Request\)/);
});


test("Results UI sends a contract-compatible validation batch", () => {
  const source = resultsPage();
  assert.match(source, /RESULTS_IDEA_VALIDATION_MAX_IDEAS/);
  assert.match(source, /opportunitiesForValidation\.slice\(0, RESULTS_IDEA_VALIDATION_MAX_IDEAS\)/);
  assert.match(source, /ideas: contractCompatibleValidationIdeas/);
});

test("Results route rejects oversized batches instead of silently validating extra ideas", () => {
  const source = route();
  assert.match(source, /too_many_ideas/);
  assert.match(source, /status: 413/);
  assert.doesNotMatch(source, /body\.ideas\) \? body\.ideas\.slice\(0, 30\)/);
});

test("Results route avoids aggregation for malformed or empty accepted input", () => {
  const source = route();
  assert.match(source, /invalid_ideas/);
  assert.match(source, /parsed\.ideas\.length === 0/);
  assert.match(source, /return NextResponse\.json\(\{ validations: \{\} \}\)/);
});

test("Results route reuses duplicate IDs deterministically within the same response map", () => {
  const source = route();
  assert.match(source, /validatedById = new Map/);
  assert.match(source, /validatedById\.get\(idea\.id\)/);
});
