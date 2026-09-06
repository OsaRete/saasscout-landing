/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseValidationDesignOutput,
  ValidationDesignOutputError,
} from "../lib/validation/design-assistant/parser.ts";
import {
  parseValidationDesignIntent,
  ValidationDesignError,
  ValidationDesignService,
} from "../lib/validation/design-assistant/service.ts";
import { validationDesignResponseFormat } from "../lib/validation/design-assistant/schema.ts";
import {
  VALIDATION_DESIGN_MAX_OUTPUT_TOKENS,
  VALIDATION_DESIGN_MODEL,
  type ExperimentDesignDraft,
} from "../lib/validation/design-assistant/contracts.ts";
import {
  createPlanDraftHandoff,
  matchesPlanDraftHandoff,
} from "../components/validation/plan-draft-handoff.ts";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/validation/design-assistant/route.ts");
const service = read("lib/validation/design-assistant/service.ts");
const hypothesisUi = read("components/validation/hypothesis-form.tsx");
const experimentUi = read("components/validation/experiment-form.tsx");
const hypothesisUiSource = hypothesisUi;
const workspaceUi = read("app/validation/[id]/page.tsx");
const interviewUi = read(
  "components/validation/customer-interview-workspace.tsx",
);
const surveyUi = read("components/validation/survey-workspace.tsx");
const v7Files = [
  "contracts.ts",
  "diagnostics.ts",
  "model-output.ts",
  "service.ts",
  "snapshot.ts",
].map((name) => read(`lib/validation/intelligence/${name}`));
const subjectId = "11111111-1111-4111-8111-111111111111";
const hypothesisVersionId = "22222222-2222-4222-8222-222222222222";

const hypothesisOutput = JSON.stringify({
  mode: "hypothesis",
  hypothesisStatement:
    "Operators repeatedly reconcile failed imports manually.",
  problemAssumption: "Failed imports create recurring reconciliation work.",
  targetCustomerAssumption: "Operations leaders handling weekly data imports.",
  expectedCurrentBehavior:
    "They use spreadsheets and manual checks after failures.",
  mostImportantUncertainty:
    "Whether the problem recurs often enough to prioritize.",
  weakeningEvidence: [
    "Recent imports completed without manual reconciliation.",
  ],
});
const experimentOutput = (family: "customer_interview" | "survey") =>
  JSON.stringify({
    mode: "experiment",
    recommendedFamily: family,
    goal: "Understand recent reconciliation behavior.",
    rationale: "Behavioral detail is the most important current gap.",
    targetAudience: [
      "Operations leaders who handled an import in the last month",
    ],
    screeningCriteria: ["Personally observed a recent failed import"],
    evidenceGap: "Frequency and operational cost remain unknown.",
    suggestedCollectionMethod: "Scheduled 30-minute one-to-one conversations",
    privacyMode: "anonymous_notes",
    interviewQuestions:
      family === "customer_interview"
        ? Array.from({ length: 5 }, (_, index) => ({
            prompt: `Describe recent behavior ${index + 1} without predicting intent.`,
          }))
        : [],
    surveyQuestions:
      family === "survey"
        ? [
            {
              questionRef: "role",
              prompt: "Which role best describes your work?",
              type: "single_choice",
              required: true,
              options: ["Founder / Owner", "Operations", "Finance", "Other"],
            },
            ...Array.from({ length: 4 }, (_, index) => ({
              questionRef: `behavior_${index}`,
              prompt: `What happened during your recent import ${index + 1}?`,
              type: "short_text",
              required: true,
              options: [],
            })),
          ]
        : [],
  });

test("request contract rejects unsupported mode, browser authority, model/provider, malformed IDs, and oversized seed text", () => {
  assert.throws(
    () => parseValidationDesignIntent({ mode: "chat", subjectId }),
    (error: any) => error.code === "unsupported_mode",
  );
  for (const field of [
    "owner_id",
    "ownerId",
    "model",
    "provider",
    "systemPrompt",
  ]) {
    assert.throws(() =>
      parseValidationDesignIntent({
        mode: "hypothesis",
        subjectId,
        draftInput: {
          targetSegment: "Operations teams",
          problemClaim: "Recurring manual work",
        },
        [field]: "attacker-controlled",
      }),
    );
  }
  assert.throws(() =>
    parseValidationDesignIntent({
      mode: "experiment",
      subjectId: "not-an-id",
      hypothesisVersionId,
    }),
  );
  assert.throws(() =>
    parseValidationDesignIntent({
      mode: "hypothesis",
      subjectId,
      draftInput: {
        targetSegment: "Operations teams",
        problemClaim: "x".repeat(2_001),
      },
    }),
  );
});

test("strict provider schemas are mode-specific JSON Schema structured outputs", () => {
  for (const mode of ["hypothesis", "experiment"] as const) {
    const format = validationDesignResponseFormat(mode);
    assert.equal(format.type, "json_schema");
    assert.equal(format.json_schema.strict, true);
    assert.equal(format.json_schema.schema.additionalProperties, false);
  }
  assert.equal(VALIDATION_DESIGN_MODEL, "openai/gpt-5.1");
  assert.ok(VALIDATION_DESIGN_MAX_OUTPUT_TOKENS < 3_500);
  assert.match(
    service,
    /max_completion_tokens: VALIDATION_DESIGN_MAX_OUTPUT_TOKENS/,
  );
  assert.doesNotMatch(service, /type:\s*["']json_object["']/);
});

test("authoritative parser accepts bounded hypothesis and both existing Beta experiment families", () => {
  assert.equal(
    parseValidationDesignOutput(hypothesisOutput, "hypothesis").mode,
    "hypothesis",
  );
  for (const family of ["customer_interview", "survey"] as const) {
    const parsed = parseValidationDesignOutput(
      experimentOutput(family),
      "experiment",
    );
    assert.equal(parsed.mode, "experiment");
    assert.equal(parsed.recommendedFamily, family);
    const questions =
      family === "survey" ? parsed.surveyQuestions : parsed.interviewQuestions;
    assert.ok(questions.length >= 5 && questions.length <= 8);
  }
});

test("parser rejects malformed output, unsupported families/types, excess questions, empty choices, and placeholder choices", () => {
  assert.throws(
    () => parseValidationDesignOutput("not json", "hypothesis"),
    ValidationDesignOutputError,
  );
  for (const mutate of [
    (draft: any) => (draft.recommendedFamily = "landing_waitlist"),
    (draft: any) => (draft.surveyQuestions[0].type = "rating"),
    (draft: any) => (draft.surveyQuestions[0].options = []),
    (draft: any) =>
      (draft.surveyQuestions[0].options = ["Option 1", "Option 2"]),
    (draft: any) =>
      draft.surveyQuestions.push(...draft.surveyQuestions.slice(0, 4)),
  ]) {
    const draft = JSON.parse(experimentOutput("survey"));
    mutate(draft);
    assert.throws(
      () => parseValidationDesignOutput(JSON.stringify(draft), "experiment"),
      ValidationDesignOutputError,
    );
  }
});

function dbFor(ownerMatch = true, hypothesisMatch = true) {
  return {
    from(table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () =>
          table === "validation_subjects"
            ? ownerMatch
              ? {
                  data: {
                    id: subjectId,
                    label: "Import operations",
                    context_snapshot: {},
                  },
                  error: null,
                }
              : { data: null, error: null }
            : hypothesisMatch
              ? {
                  data: {
                    id: hypothesisVersionId,
                    subject_id: subjectId,
                    target_segment: "Operations leaders",
                    problem_claim:
                      "Import failures create recurring manual work",
                    expected_observable_behavior:
                      "Recent spreadsheet reconciliation",
                  },
                  error: null,
                }
              : { data: null, error: null },
      };
      return chain;
    },
  };
}

test("one explicit service generation makes exactly one provider call with no retry or fallback", async () => {
  let calls = 0;
  const provider = {
    async generate() {
      calls += 1;
      return hypothesisOutput;
    },
  };
  const design = new ValidationDesignService(dbFor() as any, provider);
  await design.generate("owner-a", {
    mode: "hypothesis",
    subjectId,
    draftInput: {
      targetSegment: "Operations teams",
      problemClaim: "Recurring reconciliation work",
    },
  });
  assert.equal(calls, 1);
  assert.doesNotMatch(service, /retry|fallback|repair|second.?pass/i);
});

test("cross-user subject and hypothesis references fail before provider generation", async () => {
  let calls = 0;
  const provider = {
    async generate() {
      calls += 1;
      return experimentOutput("survey");
    },
  };
  for (const db of [dbFor(false), dbFor(true, false)]) {
    const design = new ValidationDesignService(db as any, provider);
    await assert.rejects(
      design.generate("different-owner", {
        mode: "experiment",
        subjectId,
        hypothesisVersionId,
      }),
      (error: any) =>
        error instanceof ValidationDesignError &&
        error.code === "ownership_failed",
    );
  }
  assert.equal(calls, 0);
});

test("endpoint authenticates first and route returns draft only", () => {
  assert.ok(
    route.indexOf("requireUser(request)") < route.indexOf("request.json()"),
  );
  assert.match(service, /\.eq\("owner_id", ownerId\)/);
  assert.match(service, /\.eq\("subject_id", intent\.subjectId\)/);
  assert.doesNotMatch(
    route + service,
    /createHypothesis|createExperiment|createInterviewPlan|createSurveyPlan|publish|recordObservation|validation_evidence|problem_observations|canonical_problems/,
  );
});

test("UI calls AI only from explicit handlers and applying a draft changes state without submission", () => {
  for (const ui of [hypothesisUi, experimentUi]) {
    assert.match(ui, /onClick=\{generateDraft\}/);
    assert.match(ui, /disabled=\{[^}]*aiBusy/);
    assert.doesNotMatch(ui, /useEffect/);
    assert.match(ui, /onClick=\{applyDraft\}/);
  }
  for (const ui of [hypothesisUi, experimentUi]) {
    const applyBody = ui.match(
      /function applyDraft\(\) \{([\s\S]*?)\n  \}/,
    )?.[1];
    assert.ok(applyBody);
    assert.doesNotMatch(applyBody, /validationRequest|submit\(/);
  }
  assert.match(hypothesisUi, /type="submit"/);
  assert.match(experimentUi, /type="submit"/);
  assert.match(hypothesisUi + experimentUi, /Discard/);
});

test("V7.2 stages exact interview questions only for the created matching context", () => {
  const draft = JSON.parse(
    experimentOutput("customer_interview"),
  ) as ExperimentDesignDraft;
  const created = {
    experiment: { id: "experiment-a" },
    version: {
      id: "version-a",
      hypothesis_version_id: hypothesisVersionId,
      family: "customer_interview" as const,
    },
  };
  const handoff = createPlanDraftHandoff(
    subjectId,
    hypothesisVersionId,
    draft,
    created,
  );
  assert.deepEqual(handoff?.interviewQuestions, draft.interviewQuestions);
  assert.equal(
    matchesPlanDraftHandoff(handoff, {
      subjectId,
      hypothesisVersionId,
      experimentId: "experiment-a",
      experimentVersionId: "version-a",
      family: "customer_interview",
    }),
    true,
  );
  assert.equal(
    matchesPlanDraftHandoff(handoff, {
      subjectId,
      hypothesisVersionId,
      experimentId: "experiment-a",
      experimentVersionId: "version-a",
      family: "survey",
    }),
    false,
  );
});

test("V7.2 preserves structured Survey choices and rejects stale or invalid drafts locally", () => {
  const draft = JSON.parse(experimentOutput("survey")) as ExperimentDesignDraft;
  const created = {
    experiment: { id: "experiment-b" },
    version: {
      id: "version-b",
      hypothesis_version_id: hypothesisVersionId,
      family: "survey" as const,
    },
  };
  const handoff = createPlanDraftHandoff(
    subjectId,
    hypothesisVersionId,
    draft,
    created,
  );
  assert.deepEqual(handoff?.surveyQuestions, draft.surveyQuestions);
  assert.equal(
    createPlanDraftHandoff(subjectId, "stale-hypothesis", draft, created),
    null,
  );
  const placeholders = structuredClone(draft);
  placeholders.surveyQuestions[0].options = ["Option 1", "Option 2"];
  // V7.1 rejects placeholders authoritatively; V7.2 never invents them.
  assert.doesNotMatch(
    JSON.stringify(handoff?.surveyQuestions),
    /"Option (?:1|2)"/,
  );
  assert.equal(
    createPlanDraftHandoff(
      subjectId,
      hypothesisVersionId,
      placeholders,
      created,
    ),
    null,
  );
});

test("V7.2 apply controls mutate local editor state without persistence or model calls", () => {
  for (const ui of [interviewUi, surveyUi]) {
    assert.match(ui, /Use AI suggested questions/);
    assert.match(ui, /AI suggested questions available/);
    const applyStart = ui.indexOf("function applySuggestions()");
    const applyEnd = ui.indexOf("async function", applyStart);
    const apply = ui.slice(applyStart, applyEnd);
    assert.ok(apply);
    assert.match(apply, /setQuestions/);
    assert.match(apply, /onSuggestionsDone/);
    assert.doesNotMatch(
      apply,
      /validationRequest|fetch|save|publish|transition|design-assistant/i,
    );
    assert.match(ui, /Replace my questions/);
  }
  assert.match(interviewUi, /Save plan version/);
  assert.match(surveyUi, /Save immutable plan/);
  assert.match(surveyUi, /Remove question/);
  assert.doesNotMatch(interviewUi + surveyUi, /openrouter|openai/i);
});

test("V7.2 completion status scrolls and focuses exactly from successful explicit generation", () => {
  for (const ui of [hypothesisUiSource, experimentUi]) {
    assert.match(ui, /role="status" aria-live="polite"/);
    assert.match(ui, /AI draft ready/);
    assert.match(ui, /scrollIntoView\(\{[\s\S]*behavior: "smooth"/);
    assert.match(ui, /focus\(\{ preventScroll: true \}\)/);
    assert.match(ui, /tabIndex=\{-1\}/);
    assert.match(ui, /requestAnimationFrame/);
    assert.equal((ui.match(/scrollIntoView/g) || []).length, 1);
    const catchBody = ui.match(
      /\} catch \(caught\) \{([\s\S]*?)\n    \} finally/,
    )?.[1];
    assert.ok(catchBody);
    assert.doesNotMatch(catchBody, /scrollIntoView|focus\(/);
  }
  assert.match(hypothesisUiSource, /Generating draft…/);
  assert.match(experimentUi, /Designing experiment…/);
  assert.match(workspaceUi, /matchesPlanDraftHandoff/);
});

test("V7 source retains its independent model path and does not import V7.1", () => {
  for (const file of v7Files) assert.doesNotMatch(file, /design-assistant/);
  assert.equal(
    v7Files.filter((file) => file.includes("openai/gpt-5.1")).length,
    1,
  );
});
