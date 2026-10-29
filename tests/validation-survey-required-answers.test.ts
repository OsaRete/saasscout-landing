import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateSurveyAnswers } from "../lib/validation/surveys.ts";

const questions = [
  { questionRef: "short_text", prompt: "Short", type: "short_text" as const, required: true },
  { questionRef: "long_text", prompt: "Long", type: "long_text" as const, required: true },
  { questionRef: "multiple", prompt: "Select", type: "multiple_choice" as const, required: true, options: ["A", "B"] },
  { questionRef: "optional_text", prompt: "Optional", type: "short_text" as const, required: false },
  { questionRef: "optional_multiple", prompt: "Optional choices", type: "multiple_choice" as const, required: false, options: ["A", "B"] },
];

const answers = (overrides: Record<string, string | readonly string[]>) => [
  { questionRef: "short_text", value: "Useful answer" },
  { questionRef: "long_text", value: "A longer useful answer" },
  { questionRef: "multiple", value: ["A"] },
].map(answer => ({ ...answer, value: overrides[answer.questionRef] ?? answer.value })).concat(
  Object.entries(overrides)
    .filter(([questionRef]) => !["short_text", "long_text", "multiple"].includes(questionRef))
    .map(([questionRef, value]) => ({ questionRef, value })),
);

test("required short and long text reject Unicode whitespace without rewriting valid content", () => {
  for (const blank of [" \t\n", "\u0085", "\u00a0", "\u1680", "\u2000\u200a", "\u2028\u2029", "\u202f", "\u205f", "\u3000", "\ufeff"]) {
    assert.throws(() => validateSurveyAnswers(questions, answers({ short_text: blank })), /required/i);
    assert.throws(() => validateSurveyAnswers(questions, answers({ long_text: blank })), /required/i);
  }

  const exact = " \u00a0kept as submitted\u3000 ";
  const validated = validateSurveyAnswers(questions, answers({ short_text: exact }));
  assert.equal(validated.find(answer => answer.questionRef === "short_text")?.value, exact);
});

test("required multiple choice rejects no selections while optional empty answers remain valid", () => {
  assert.throws(() => validateSurveyAnswers(questions, [
    { questionRef: "short_text", value: "ok" },
    { questionRef: "long_text", value: "ok" },
    { questionRef: "multiple", value: [] },
  ]), /required/i);

  const valid = validateSurveyAnswers(questions, [
    { questionRef: "short_text", value: "ok" },
    { questionRef: "long_text", value: "ok" },
    { questionRef: "multiple", value: ["B"] },
    { questionRef: "optional_text", value: " \u00a0" },
    { questionRef: "optional_multiple", value: [] },
  ]);
  assert.deepEqual(valid.find(answer => answer.questionRef === "optional_multiple")?.value, []);
  assert.equal(valid.find(answer => answer.questionRef === "optional_text")?.value, " \u00a0");
});

test("forward migration enforces required blank checks before atomic submission writes", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20261024000000_survey_required_answer_integrity.sql", import.meta.url), "utf8");
  const rpcStart = migration.indexOf("create or replace function public.validation_submit_public_survey");
  const rpcEnd = migration.indexOf("end $$;", rpcStart);
  assert.ok(rpcStart >= 0 && rpcEnd > rpcStart);
  const rpc = migration.slice(rpcStart, rpcEnd);

  assert.match(rpc, /coalesce\(\(q->>'required'\)::boolean,false\) and selected_count=0/);
  assert.match(rpc, /coalesce\(\(q->>'required'\)::boolean,false\) and btrim\(a->>'value',U&'/);
  assert.match(rpc, /selected_count>12/);
  assert.match(rpc, /invalid multiple choice option/);
  assert.match(rpc, /duplicate multiple choice option/);
  assert.ok(rpc.indexOf("for a in select value from jsonb_array_elements(p_answers) loop") < rpc.indexOf("insert into public.validation_survey_submissions"));
  assert.ok(rpc.indexOf("insert into public.validation_survey_submissions") < rpc.indexOf("insert into public.validation_survey_answers"));
});
