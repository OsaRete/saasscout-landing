import assert from "node:assert/strict";
import test from "node:test";
import { parseStrictModelJson } from "../lib/scan/model-json.ts";
import { buildSolutionIntelligencePrompt } from "../lib/scan/safe-prompt-builders.ts";
import {
  buildSafeSolutionIntelligenceLog,
  computeSolutionIntelligenceDiagnostics,
  deriveSuitabilityBand,
  publicSolutionIntelligenceConfigurationFailure,
  publicSolutionIntelligenceFailure,
  type SolutionCategory,
  SolutionIntelligenceValidationError,
  validateSolutionIntelligenceOutput,
} from "../lib/scan/solution-intelligence.ts";
import {
  validateAnalyzeEvidenceOutput,
  validateGenerateOpportunitiesOutput,
} from "../lib/scan/output-validation.ts";

const evidenceIds = ["scan-user-evidence"] as const;
const e = (text = "Evidence supports this claim") => ({
  text,
  groundingMode: "evidence",
  evidenceRefs: [{ evidenceId: "scan-user-evidence", relevance: "primary" }],
});
const inf = (
  text = "Inferred claim",
  inferenceReason = "This is inferred from current evidence gaps.",
) => ({ text, groundingMode: "inference", evidenceRefs: [], inferenceReason });
function category(category: SolutionCategory, suitability = 0.5) {
  return {
    category,
    suitability,
    suitabilityBand: deriveSuitabilityBand(suitability),
    rationale: inf(`${category} fit is inferred.`),
    advantages: [inf("Advantage")],
    limitations: [inf("Limitation")],
    prerequisites: [inf("Prerequisite")],
  };
}
function base(
  recommendedCategory: SolutionCategory = "validate_first",
  categories = [
    category("software_product", 0.55),
    category("productized_service", 0.7),
    category("validate_first", 0.9),
  ],
) {
  return {
    version: "scan-solution-intelligence@1",
    problemFraming: e("Users describe a repeated workflow problem."),
    evaluatedCategories: categories,
    recommendedCategory,
    secondaryCategory: [...categories]
      .filter((c) => c.category !== recommendedCategory)
      .sort((a, b) => b.suitability - a.suitability)[0]?.category,
    recommendation: inf("Recommendation compares evidenced problem fit."),
    existingSolutionAssessment: {
      knownAlternatives: [
        {
          nameOrCategory: "Manual spreadsheets",
          alternativeType: "manual_workaround",
          observedStrengths: [inf("Flexible workaround")],
          observedWeaknesses: [e("Manual workaround remains painful")],
          evidenceRefs: [],
        },
      ],
      evidenceCoverage: "limited",
      whatAppearsValidated: [e("The problem exists")],
      whatAppearsPoorlySolved: [e("Current workaround is painful")],
      replacementRisk: inf("Replacement risk remains unknown"),
    },
    innovationAssessment: {
      innovationMode: "unproven_concept",
      verifiedFoundation: [],
      proposedDifferentiation: [inf("Potential differentiation")],
      unverifiedAssumptions: [inf("Assumption")],
      feasibilityConstraints: [inf("Constraint")],
      noveltyRisk: "moderate",
    },
    validationReadiness: {
      readiness: "problem_validation_ready",
      knownFacts: [e("Known fact")],
      criticalUnknowns: [inf("Unknown")],
      cheapestNextTest: "customer_interviews",
      testRationale: inf("Interviews are cheapest"),
      successSignal: inf("Repeated confirmation"),
      failureSignal: inf("No repeated pain"),
    },
    keyAssumptions: [inf("Key assumption")],
    risks: [inf("Risk")],
    nextValidationAction: inf("Interview five affected users"),
  };
}
function valid(input: unknown) {
  return validateSolutionIntelligenceOutput(input, { evidenceIds });
}

test("accepts valid software, service, automation, no-build, and hybrid recommendations", () => {
  for (const [recommended, cats] of [
    [
      "software_product",
      [
        category("software_product", 0.9),
        category("productized_service", 0.45),
        category("validate_first", 0.3),
      ],
    ],
    [
      "productized_service",
      [
        category("software_product", 0.35),
        category("productized_service", 0.88),
        category("validate_first", 0.4),
      ],
    ],
    [
      "automation",
      [
        category("automation", 0.91),
        category("consulting", 0.5),
        category("validate_first", 0.4),
      ],
    ],
    [
      "no_build_recommended",
      [
        category("software_product", 0.2),
        category("consulting", 0.3),
        category("no_build_recommended", 0.92),
      ],
    ],
    [
      "hybrid_solution",
      [
        category("hybrid_solution", 0.86),
        category("managed_service", 0.7),
        category("validate_first", 0.5),
      ],
    ],
  ] as const) {
    assert.equal(
      valid(base(recommended, cats)).recommendedCategory,
      recommended,
    );
  }
});

test("rejects unknown, duplicate, absent recommended, missing validate-first, invented evidence, and inference without reason", () => {
  assert.throws(
    () =>
      valid({
        ...base(),
        evaluatedCategories: [
          category("software_product"),
          category("consulting"),
          { ...category("validate_first"), category: "bad" },
        ],
      }),
    SolutionIntelligenceValidationError,
  );
  assert.throws(
    () =>
      valid({
        ...base(),
        evaluatedCategories: [
          category("software_product"),
          category("software_product"),
          category("validate_first"),
        ],
      }),
    SolutionIntelligenceValidationError,
  );
  assert.throws(
    () =>
      valid({
        ...base("automation"),
        evaluatedCategories: [
          category("software_product"),
          category("consulting"),
          category("validate_first"),
        ],
      }),
    SolutionIntelligenceValidationError,
  );
  assert.throws(
    () =>
      valid({
        ...base(),
        evaluatedCategories: [
          category("software_product"),
          category("consulting"),
          category("automation"),
        ],
      }),
    SolutionIntelligenceValidationError,
  );
  assert.throws(
    () =>
      valid({
        ...base(),
        problemFraming: {
          text: "bad",
          groundingMode: "evidence",
          evidenceRefs: [{ evidenceId: "invented" }],
        },
      }),
    SolutionIntelligenceValidationError,
  );
  assert.throws(
    () =>
      valid({
        ...base(),
        recommendation: {
          text: "bad",
          groundingMode: "inference",
          evidenceRefs: [],
        },
      }),
    SolutionIntelligenceValidationError,
  );
});

test("rejects named direct competitor without evidence and malformed innovation", () => {
  const b = base();
  assert.throws(
    () =>
      valid({
        ...b,
        existingSolutionAssessment: {
          ...b.existingSolutionAssessment,
          knownAlternatives: [
            {
              nameOrCategory: "NamedCo",
              alternativeType: "direct_competitor",
              observedStrengths: [],
              observedWeaknesses: [],
              evidenceRefs: [],
            },
          ],
        },
      }),
    SolutionIntelligenceValidationError,
  );
  assert.throws(
    () =>
      valid({
        ...b,
        innovationAssessment: {
          ...b.innovationAssessment,
          innovationMode: "incremental_improvement",
          verifiedFoundation: [],
        },
      }),
    SolutionIntelligenceValidationError,
  );
  assert.equal(
    valid(b).innovationAssessment.innovationMode,
    "unproven_concept",
  );
});

test("represents direct competitors and manual workarounds separately when grounded", () => {
  const b = base();
  const output = valid({
    ...b,
    existingSolutionAssessment: {
      ...b.existingSolutionAssessment,
      knownAlternatives: [
        {
          nameOrCategory: "Grounded Competitor",
          alternativeType: "direct_competitor",
          observedStrengths: [e("Competitor exists")],
          observedWeaknesses: [],
          evidenceRefs: [{ evidenceId: "scan-user-evidence" }],
        },
        b.existingSolutionAssessment.knownAlternatives[0],
      ],
    },
  });
  assert.deepEqual(
    output.existingSolutionAssessment.knownAlternatives.map(
      (a) => a.alternativeType,
    ),
    ["direct_competitor", "manual_workaround"],
  );
});

test("validates readiness enum, diagnostics privacy shape, and deterministic output", () => {
  const output = valid(
    base("automation", [
      category("automation", 0.9),
      category("consulting", 0.4),
      category("validate_first", 0.3),
    ]),
  );
  assert.equal(
    output.validationReadiness.cheapestNextTest,
    "customer_interviews",
  );
  const first = computeSolutionIntelligenceDiagnostics(output);
  const second = computeSolutionIntelligenceDiagnostics(output);
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), [
    "categoryCount",
    "uniqueCategoryCount",
    "recommendedCategoryPresent",
    "validateFirstConsidered",
    "evidenceGroundedClaimPercentage",
    "inferenceClaimPercentage",
    "independentEvidenceIdsReferenced",
    "invalidReferenceCount",
    "existingAlternativeCount",
    "namedAlternativesWithEvidence",
    "innovationVerifiedFoundationCount",
    "innovationAssumptionCount",
    "criticalUnknownCount",
    "validationReadiness",
    "cheapestNextTest",
    "contradictionReferenceCount",
  ]);
  assert.equal(JSON.stringify(first).includes("Manual spreadsheets"), false);
  assert.equal(JSON.stringify(first).includes("Inferred claim"), false);
});

test("strict JSON and schema validation reject prose, malformed JSON, missing fields, and unknown fields", () => {
  assert.throws(() => parseStrictModelJson(`prose ${JSON.stringify(base())}`));
  assert.throws(() => parseStrictModelJson("{"));
  assert.throws(
    () => valid({ ...base(), recommendation: undefined }),
    SolutionIntelligenceValidationError,
  );
  assert.throws(
    () => valid({ ...base(), extra: true }),
    SolutionIntelligenceValidationError,
  );
});

test("hardens factual claim grounding and readiness floors", () => {
  assert.throws(
    () => valid({ ...base(), problemFraming: inf("Problem inferred") }),
    SolutionIntelligenceValidationError,
  );
  const b = base();
  assert.throws(
    () =>
      valid({
        ...b,
        existingSolutionAssessment: {
          ...b.existingSolutionAssessment,
          whatAppearsValidated: [inf("Validated inferred")],
        },
      }),
    SolutionIntelligenceValidationError,
  );
  assert.throws(
    () =>
      valid({
        ...b,
        innovationAssessment: {
          ...b.innovationAssessment,
          innovationMode: "incremental_improvement",
          verifiedFoundation: [inf("Foundation inferred")],
          unverifiedAssumptions: [],
        },
      }),
    SolutionIntelligenceValidationError,
  );
  assert.throws(
    () =>
      valid({
        ...b,
        validationReadiness: {
          ...b.validationReadiness,
          knownFacts: [inf("Fact inferred")],
        },
      }),
    SolutionIntelligenceValidationError,
  );
  assert.equal(valid(b).problemFraming.groundingMode, "evidence");
  assert.equal(
    valid({
      ...b,
      innovationAssessment: {
        ...b.innovationAssessment,
        innovationMode: "no_innovation_needed",
        verifiedFoundation: [],
        unverifiedAssumptions: [],
      },
    }).innovationAssessment.innovationMode,
    "no_innovation_needed",
  );
  assert.equal(
    valid({
      ...b,
      validationReadiness: { ...b.validationReadiness, readiness: "not_ready", knownFacts: [] },
    }).validationReadiness.knownFacts.length,
    0,
  );
  assert.throws(
    () =>
      valid({
        ...b,
        validationReadiness: {
          ...b.validationReadiness,
          readiness: "demand_test_ready",
          knownFacts: [],
        },
      }),
    SolutionIntelligenceValidationError,
  );
});

test("derives every suitability boundary from the single policy", () => {
  for (const [score, band] of [
    [0, "poor"],
    [0.2 - Number.EPSILON, "poor"],
    [0.2, "weak"],
    [0.2 + Number.EPSILON, "weak"],
    [0.4 - Number.EPSILON, "weak"],
    [0.4, "possible"],
    [0.4 + Number.EPSILON, "possible"],
    [0.65 - Number.EPSILON, "possible"],
    [0.65, "strong"],
    [0.65 + Number.EPSILON, "strong"],
    [0.85 - Number.EPSILON, "strong"],
    [0.85, "best_fit"],
    [0.85 + Number.EPSILON, "best_fit"],
    [1, "best_fit"],
  ] as const) {
    assert.equal(deriveSuitabilityBand(score), band);
  }
  for (const invalid of [NaN, Infinity, -0.01, 1.01]) {
    assert.throws(() => deriveSuitabilityBand(invalid), RangeError);
  }
});

test("overwrites an inconsistent legacy band and derives a missing band", () => {
  const mismatch = base("validate_first", [
    category("software_product", 0.5),
    category("productized_service", 0.4),
    { ...category("validate_first", 0.85), suitabilityBand: "strong" },
  ]);
  const normalized = valid(mismatch);
  assert.equal(normalized.evaluatedCategories[2].suitability, 0.85);
  assert.equal(normalized.evaluatedCategories[2].suitabilityBand, "best_fit");

  const missing = base();
  delete (missing.evaluatedCategories[0] as { suitabilityBand?: string }).suitabilityBand;
  assert.equal(valid(missing).evaluatedCategories[0].suitabilityBand, "possible");
});

test("rejects missing, malformed, non-finite, and out-of-range suitability", () => {
  for (const suitability of [undefined, "0.9", NaN, Infinity, -0.01, 1.01]) {
    const input = base();
    (input.evaluatedCategories[0] as { suitability?: unknown }).suitability = suitability;
    assert.throws(() => valid(input), SolutionIntelligenceValidationError);
  }
});

test("validates recommendation ordering, secondary presence, and ties", () => {
  assert.throws(
    () =>
      valid({
        ...base("software_product", [
          category("software_product", 0.5),
          category("productized_service", 0.7),
          category("validate_first", 0.65),
        ]),
        secondaryCategory: "productized_service",
      }),
    SolutionIntelligenceValidationError,
  );
  assert.throws(
    () =>
      valid({
        ...base(),
        secondaryCategory: "consulting",
      }),
    SolutionIntelligenceValidationError,
  );
  assert.throws(
    () =>
      valid({
        ...base("validate_first"),
        secondaryCategory: "software_product",
      }),
    SolutionIntelligenceValidationError,
  );
  assert.equal(
    valid(
      base("validate_first", [
        category("software_product", 0.85),
        category("productized_service", 0.85),
        category("validate_first", 0.85),
      ]),
    ).recommendedCategory,
    "validate_first",
  );
});

test("hardens existing alternative evidence refs and category-level alternatives", () => {
  const b = base();
  assert.throws(
    () =>
      valid({
        ...b,
        existingSolutionAssessment: {
          ...b.existingSolutionAssessment,
          knownAlternatives: [
            {
              nameOrCategory: "NamedCo",
              alternativeType: "direct_competitor",
              observedStrengths: [],
              observedWeaknesses: [],
              evidenceRefs: [{ evidenceId: "scan-user-evidence", relevance: "bad" }],
            },
          ],
        },
      }),
    SolutionIntelligenceValidationError,
  );
  assert.equal(valid({
    ...b,
    existingSolutionAssessment: {
      ...b.existingSolutionAssessment,
      knownAlternatives: [{
        nameOrCategory: "NamedCo",
        alternativeType: "direct_competitor",
        observedStrengths: [],
        observedWeaknesses: [],
        evidenceRefs: [{ evidenceId: "scan-user-evidence" }, { evidenceId: "scan-user-evidence" }],
      }],
    },
  }).existingSolutionAssessment.knownAlternatives[0].evidenceRefs.length, 1);
  assert.throws(
    () =>
      valid({
        ...b,
        existingSolutionAssessment: {
          ...b.existingSolutionAssessment,
          knownAlternatives: [
            {
              nameOrCategory: "NamedCo",
              alternativeType: "direct_competitor",
              observedStrengths: [],
              observedWeaknesses: [],
              evidenceRefs: [{ evidenceId: "invented" }],
            },
          ],
        },
      }),
    SolutionIntelligenceValidationError,
  );
  assert.equal(
    valid({
      ...b,
      existingSolutionAssessment: {
        ...b.existingSolutionAssessment,
        knownAlternatives: [
          {
            nameOrCategory: "Generic workflow tools",
            alternativeType: "category_level_alternative",
            observedStrengths: [inf("Category may partially solve the workflow")],
            observedWeaknesses: [],
            evidenceRefs: [],
          },
        ],
      },
    }).existingSolutionAssessment.knownAlternatives[0].alternativeType,
    "category_level_alternative",
  );
});

test("public error helpers and safe logging do not expose private payloads", () => {
  assert.equal(JSON.stringify(publicSolutionIntelligenceFailure()).includes("provider exploded"), false);
  assert.equal(JSON.stringify(publicSolutionIntelligenceConfigurationFailure()).includes("OpenRouter"), false);
  assert.equal(JSON.stringify(publicSolutionIntelligenceConfigurationFailure()).includes("API key"), false);
  const output = valid(base());
  const log = buildSafeSolutionIntelligenceLog({
    event: "solution_intelligence_validation",
    route: "solution-intelligence",
    promptVersion: "scan-solution-intelligence@1",
    model: "openai/gpt-4.1-mini",
    validationStatus: "passed",
    durationMs: 12,
    diagnostics: computeSolutionIntelligenceDiagnostics(output),
  });
  const serialized = JSON.stringify(log);
  assert.equal(serialized.includes("Users describe"), false);
  assert.equal(serialized.includes("Manual spreadsheets"), false);
  assert.equal(serialized.includes("scan-user-evidence"), false);
  assert.equal(serialized.includes("Evidence supports"), false);
  assert.equal(serialized.includes("This is inferred"), false);
  assert.equal(serialized.includes("private input"), false);
});

test("prompt states neutrality and grounding boundaries", () => {
  const prompt = buildSolutionIntelligencePrompt({
    intent: { market: "m", audience: "a", region: "r" },
    evidence: [{ evidenceId: "scan-user-evidence", content: "evidence" }],
  });
  assert.match(prompt, /Do not assume software is correct/);
  assert.match(prompt, /validate_first or no_build_recommended/);
  assert.match(prompt, /Do not invent competitors/);
  assert.match(prompt, /Derived analysis is not independent evidence/);
  assert.match(prompt, /Return suitability only; do not return suitabilityBand/);
  assert.doesNotMatch(prompt.slice(prompt.indexOf("JSON shape:")), /suitabilityBand/);
});

test("legacy analyze and generate contracts remain compatible", () => {
  const claim = e("grounded");
  validateAnalyzeEvidenceOutput(
    {
      inferred_market: "Market",
      audience_summary: "Audience",
      evidence_summary: "Evidence",
      pain_points: "Pain",
      repeated_patterns: "Pattern",
      workflow_problems: "Workflow",
      willingness_to_pay_signals: "None",
      opportunity_angles: "Angle",
      confidence_score: 8,
      grounding: {
        inferred_market: claim,
        audience_summary: claim,
        evidence_summary: claim,
        pain_points: [claim],
        repeated_patterns: [claim],
        workflow_problems: [claim],
        willingness_to_pay_signals: [inf("No signal")],
        opportunity_angles: [inf("Angle")],
        confidence_score: claim,
      },
    },
    { evidenceIds },
  );
  const opp = {
    title: "A",
    score: 8,
    pain: "p",
    customer: "c",
    mvp: "m",
    pricing: "p",
    difficulty: "Easy",
    problem_summary: "p",
    target_customer: "c",
    mvp_roadmap: "r",
    validation_questions: "q",
    landing_page_idea: "l",
    acquisition_channels: "a",
    grounding: {
      pain: claim,
      customer: claim,
      rationale: inf(),
      mvp: inf(),
      pricing: inf(),
      score: inf(),
      difficulty: inf(),
    },
  };
  assert.equal(
    validateGenerateOpportunitiesOutput(
      { opportunities: [opp, { ...opp, title: "B" }, { ...opp, title: "C" }] },
      { evidenceIds },
    ).opportunities.length,
    3,
  );
});

test("solution prompt copies the runtime evidence ID and states the complete grounding contract", () => {
  const prompt = buildSolutionIntelligencePrompt({ intent: { market: "Agencies" }, evidence: [{ evidenceId: "pasted-evidence-001", sourceKind: "pasted_evidence", content: "Operators report manual work." }] });
  assert.match(prompt, /Allowed evidence IDs[\s\S]*pasted-evidence-001/);
  assert.doesNotMatch(prompt.slice(prompt.indexOf("JSON shape:")), /scan-user-evidence/);
  assert.match(prompt, /Allowed relevance values are exactly "primary", "supporting", and "contradicting"/);
  assert.match(prompt, /problemFraming and every item in whatAppearsValidated, verifiedFoundation, and knownFacts/);
  assert.match(prompt, /Evidence-grounded claims prohibit empty evidenceRefs/);
  assert.match(prompt, /Claim arrays must contain claim objects, never strings/);
  assert.match(prompt, /Parent or sibling evidence references do not support a child claim/);
  assert.match(prompt, /Unknown evidence IDs are prohibited/);
  assert.match(prompt, /"advantages": \[\{ "text": "evidenced advantage", "groundingMode": "evidence"/);
  assert.match(prompt, /"text": "inferred advantage", "groundingMode": "inference"/);
  assert.match(prompt, /"limitations": \[\{ "text": "evidenced limitation"/);
  assert.match(prompt, /"prerequisites": \[\{ "text": "inferred prerequisite"/);
  assert.match(prompt, /"whatAppearsValidated": \[\{/);
  assert.match(prompt, /"unverifiedAssumptions": \[\{/);
  assert.match(prompt, /"alternativeType": "direct_competitor"[\s\S]*?"evidenceRefs": \[\{ "evidenceId": "pasted-evidence-001"/);

  const example = prompt.slice(prompt.indexOf("JSON shape:"));
  const exampleIds = [...example.matchAll(/"evidenceId": "([^"]+)"/g)].map((match) => match[1]);
  assert.ok(exampleIds.length > 0);
  assert.deepEqual(new Set(exampleIds), new Set(["pasted-evidence-001"]));
});

test("claim arrays reject scalars, missing local references, missing inference reasons, unknown IDs, and parent-only references at exact paths", () => {
  const expectPath = (value: unknown, path: string) =>
    assert.throws(
      () => valid(value),
      (error) =>
        error instanceof SolutionIntelligenceValidationError &&
        error.issues.some((candidate) => candidate.path === path),
    );
  const scalar = base();
  scalar.evaluatedCategories[0].advantages = ["Reduces manual work" as never];
  expectPath(scalar, "evaluatedCategories.0.advantages.0");

  const noRefs = base();
  noRefs.evaluatedCategories[0].advantages = [{
    text: "Reduces manual work",
    groundingMode: "evidence",
    evidenceRefs: [],
  } as never];
  expectPath(noRefs, "evaluatedCategories.0.advantages.0.evidenceRefs");

  const noReason = base();
  noReason.evaluatedCategories[0].advantages = [{
    text: "May improve conversion",
    groundingMode: "inference",
    evidenceRefs: [],
  } as never];
  expectPath(noReason, "evaluatedCategories.0.advantages.0.inferenceReason");

  const unknown = base();
  unknown.evaluatedCategories[0].advantages = [{
    text: "Unknown support",
    groundingMode: "evidence",
    evidenceRefs: [{ evidenceId: "invented-id", relevance: "supporting" }],
  } as never];
  expectPath(unknown, "evaluatedCategories.0.advantages.0.evidenceRefs.0.evidenceId");

  const parentOnly = base();
  parentOnly.existingSolutionAssessment.knownAlternatives[0].evidenceRefs = [{ evidenceId: "scan-user-evidence" }];
  parentOnly.existingSolutionAssessment.knownAlternatives[0].observedStrengths = [{
    text: "Child claim has no local reference",
    groundingMode: "evidence",
    evidenceRefs: [],
  } as never];
  expectPath(parentOnly, "existingSolutionAssessment.knownAlternatives.0.observedStrengths.0.evidenceRefs");
});

test("safe solution normalization trims IDs, normalizes documented relevance casing, and deduplicates identical refs", () => {
  const value = base();
  value.problemFraming.evidenceRefs = [
    { evidenceId: " scan-user-evidence ", relevance: "PRIMARY" as never },
    { evidenceId: "scan-user-evidence", relevance: "primary" },
  ];
  const output = valid(value);
  assert.deepEqual(output.problemFraming.evidenceRefs, [{ evidenceId: "scan-user-evidence", relevance: "primary" }]);
});

test("normalization never invents or replaces unknown grounding", () => {
  const value = base();
  value.problemFraming.evidenceRefs = [{ evidenceId: " invented ", relevance: "PRIMARY" as never }];
  assert.throws(() => valid(value), (error) => error instanceof SolutionIntelligenceValidationError && error.code === "solution_model_grounding_unknown_evidence_id");
});
