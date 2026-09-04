import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SURVEY_PLAN_GUIDANCE,
  validateSurveyAnswers,
} from "../lib/validation/surveys.ts";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sql = read("supabase/migrations/20260901000000_validation_surveys.sql");
const publicUi = read("app/validation/survey/[token]/public-survey.tsx");
const adminUi = read("components/validation/survey-workspace.tsx");
const workspaceUi = read("app/validation/[id]/page.tsx");
const experimentUi = read("components/validation/experiment-form.tsx");
const sharedUi = read("components/ui.tsx");
const server = read("lib/validation/server/surveys.ts");
const docs = read("docs/IDEA_VALIDATION_SURVEYS.md");
const submitFunction = sql.slice(
  sql.indexOf("create function public.validation_submit_public_survey"),
  sql.indexOf("revoke all on function"),
);
const publishFunction = sql.slice(
  sql.indexOf("create function public.validation_publish_survey"),
  sql.indexOf("create function public.validation_revoke_survey"),
);
const planFunction = sql.slice(
  sql.indexOf("create function public.validation_create_survey_plan"),
  sql.indexOf("create function public.validation_publish_survey"),
);
const questions = [
  {
    questionRef: "question_1",
    prompt: "Current workaround?",
    type: "single_choice" as const,
    required: true,
    options: ["Sheets", "Manual"],
  },
  {
    questionRef: "question_2",
    prompt: "How many hours?",
    type: "number" as const,
    required: false,
    min: 0,
    max: 100,
  },
];

test("bounded API question and answer contracts reject malformed evidence", () => {
  assert.equal(
    validateSurveyAnswers(questions, [
      { questionRef: "question_1", value: "Sheets" },
    ]).length,
    1,
  );
  assert.throws(() => validateSurveyAnswers(questions, []), /required/i);
  assert.throws(
    () =>
      validateSurveyAnswers(questions, [
        { questionRef: "missing_id", value: "x" },
      ]),
    /unknown/i,
  );
  assert.throws(
    () =>
      validateSurveyAnswers(questions, [
        { questionRef: "question_1", value: "Email" },
      ]),
    /allowed/i,
  );
  assert.throws(
    () =>
      validateSurveyAnswers(questions, [
        { questionRef: "question_1", value: "Sheets" },
        { questionRef: "question_2", value: 101 },
      ]),
    /range/i,
  );
  assert.match(SURVEY_PLAN_GUIDANCE.join(" "), /5–10/);
});

test("submission SQL authoritatively bounds shape, count, uniqueness, existence, and required answers", () => {
  assert.match(
    submitFunction,
    /jsonb_typeof\(p_answers\) is distinct from 'array'/,
  );
  assert.match(
    submitFunction,
    /answer_count>15 or pg_column_size\(p_answers\)>65536/,
  );
  assert.match(
    submitFunction,
    /jsonb_typeof\(answer\) is distinct from 'object'/,
  );
  assert.match(submitFunction, /count\(distinct answer->>'questionRef'\)/);
  assert.match(submitFunction, /duplicate question reference/);
  assert.match(submitFunction, /unknown question/);
  assert.match(submitFunction, /required question missing/);
});

test("submission SQL enforces every persisted answer type against immutable plan definitions", () => {
  for (const invariant of [
    "invalid single choice answer",
    "invalid multiple choice answer type",
    "multiple choice answer exceeds bounds",
    "invalid multiple choice option",
    "duplicate multiple choice option",
    "invalid short text answer",
    "invalid long text answer",
    "invalid number answer",
    "unsupported survey question type",
  ])
    assert.match(submitFunction, new RegExp(invariant));
  assert.match(
    submitFunction,
    /jsonb_typeof\(a->'value'\) is distinct from 'string'/,
  );
  assert.match(
    submitFunction,
    /jsonb_typeof\(a->'value'\) is distinct from 'array'/,
  );
  assert.match(
    submitFunction,
    /jsonb_typeof\(a->'value'\) is distinct from 'number'/,
  );
  assert.match(submitFunction, /length\(a->>'value'\)>500/);
  assert.match(submitFunction, /length\(a->>'value'\)>4000/);
  assert.match(submitFunction, /q\?'min'[\s\S]+q\?'max'/);
  assert.match(
    submitFunction,
    /question_type,raw_answer\)[\s\S]+q->>'type',a->'value'/,
  );
});

test("invalid submissions are validated before transactional submission and answer inserts", () => {
  const validationEnd = submitFunction.indexOf(
    "-- The insert and every answer insert are one function transaction",
  );
  const submissionInsert = submitFunction.indexOf(
    "insert into public.validation_survey_submissions",
  );
  const answerInsert = submitFunction.indexOf(
    "insert into public.validation_survey_answers",
  );
  assert.ok(
    validationEnd > 0 &&
      submissionInsert > validationEnd &&
      answerInsert > submissionInsert,
  );
  assert.match(
    docs,
    /any validation or persistence error leaves neither a partial submission nor partial answers/,
  );
});

test("plan allocation is linear and serialized at the logical experiment root", () => {
  assert.match(planFunction, /validation_experiments[\s\S]+for update/);
  assert.match(planFunction, /order by version_number desc limit 1/);
  assert.match(
    planFunction,
    /latest\.id is null and p_supersedes_survey_plan_version_id is not null/,
  );
  assert.match(
    planFunction,
    /p_supersedes_survey_plan_version_id is distinct from latest\.id/,
  );
  assert.match(planFunction, /stale survey plan predecessor/);
  assert.match(planFunction, /n:=coalesce\(latest\.version_number,0\)\+1/);
});

test("publication replacement serializes on the owned logical experiment root", () => {
  const lock = publishFunction.indexOf("validation_experiments");
  const refresh = publishFunction.indexOf(
    "validation_survey_plan_versions",
    publishFunction.indexOf("for update"),
  );
  const revoke = publishFunction.indexOf(
    "update public.validation_survey_publications",
  );
  const insert = publishFunction.indexOf(
    "insert into public.validation_survey_publications",
  );
  assert.ok(
    lock > 0 &&
      publishFunction.indexOf("for update", lock) > lock &&
      refresh > lock &&
      revoke > refresh &&
      insert > revoke,
  );
  assert.match(
    sql,
    /unique index validation_survey_one_active_publication[\s\S]+where state='published'/,
  );
});

test("submission and revocation have deterministic publication-row lock ordering", () => {
  assert.match(submitFunction, /state='published' for share/);
  assert.match(submitFunction, /blocks revoke\/replacement until commit/);
  assert.match(sql, /UPDATE takes a row-exclusive lock/);
  assert.match(
    docs,
    /submission that acquired the shared lock while the capability was valid may finish atomically/,
  );
  assert.match(docs, /once revocation commits, later submissions cannot match/);
});

test("idempotency and respondent grouping remain unchanged", () => {
  assert.match(sql, /unique\(publication_id,idempotency_key\)/);
  assert.match(submitFunction, /existing\.payload_hash<>p_payload_hash/);
  assert.match(submitFunction, /idempotency conflict/);
  assert.match(
    submitFunction,
    /jsonb_build_object\('submissionId',existing.id,'duplicate',true\)/,
  );
  assert.match(sql, /respondent_id uuid not null default gen_random_uuid\(\)/);
  assert.doesNotMatch(sql, /validation_evidence_observations/);
  assert.match(server, /hash\(canonical\(normalized\)\)/);
});

test("public capability remains hashed, revocable, narrow, and service-role-only", () => {
  assert.match(server, /randomBytes\(32\)/);
  assert.match(server, /createHash\("sha256"\)/);
  assert.doesNotMatch(sql, /token_plain|grant (insert|update|delete).*anon/i);
  assert.match(sql, /state in\('published','revoked'\)/);
  assert.match(sql, /revoke all[\s\S]+public,anon,authenticated/);
  assert.match(sql, /grant execute[\s\S]+to service_role/);
  for (const secret of [
    "owner_id",
    "hypothesis_id",
    "experiment_id",
    "respondent_id",
  ])
    assert.doesNotMatch(publicUi, new RegExp(secret));
});

test("public UX and workspace preserve approved V6 boundaries", () => {
  for (const value of [
    "required={q.required}",
    'disabled={status==="sending"}',
    "Thank you",
    "Do not include sensitive personal information",
    "crypto.randomUUID",
    "Survey unavailable",
  ])
    assert.match(publicUi, new RegExp(value.replace(/[{}().]/g, "\\$&")));
  for (const value of [
    "Responses are real human evidence",
    "No AI interpretation",
    "respondents",
    "of {submissions.length} respondents",
    "immutable version",
  ])
    assert.match(adminUi, new RegExp(value.replaceAll(" ", "\\s+"), "i"));
  assert.doesNotMatch(
    publicUi,
    /router|\/validation\/\$|email|phone|aggregate results/i,
  );
  assert.doesNotMatch(
    adminUi,
    /validated|market fit|success probability|sentiment|model call/i,
  );
});

test("V6.1 native selects keep dark options readable without changing their choices", () => {
  assert.match(sharedUi, /\[color-scheme:dark\]/);
  assert.match(sharedUi, /\[&>option\]:bg-\[#0b1020\]/);
  assert.match(sharedUi, /\[&>option\]:text-white/);
  for (const value of [
    "customer_interview",
    "survey",
    "anonymous_notes",
    "identified_with_explicit_consent",
  ]) {
    assert.match(experimentUi, new RegExp(`value=["']${value}["']`));
  }
  for (const value of [
    "single_choice",
    "multiple_choice",
    "short_text",
    "long_text",
    "number",
  ]) {
    assert.match(adminUi, new RegExp(`value=["']${value}["']`));
  }
});

test("V6.1 copy control copies only an existing generated link with bounded feedback", () => {
  assert.match(adminUi, /\{link\s*&&[\s\S]+Copy link/);
  assert.match(adminUi, /navigator\.clipboard\?\.writeText/);
  assert.match(adminUi, /writeText\(link\)/);
  assert.match(adminUi, /setCopyStatus\("copied"\)/);
  assert.match(adminUi, /setCopyStatus\("failed"\)/);
  assert.match(adminUi, /setTimeout\([\s\S]+2500\)/);
  assert.match(adminUi, /clearTimeout\(copyReset\.current\)/);
  assert.doesNotMatch(
    adminUi.slice(
      adminUi.indexOf("async function copyLink"),
      adminUi.indexOf("async function revoke"),
    ),
    /survey-publications|console\./,
  );
});

test("V6.1 refreshes the authoritative projection on bounded return events", () => {
  assert.match(
    workspaceUi,
    /window\.addEventListener\("focus", refreshOnFocus\)/,
  );
  assert.match(
    workspaceUi,
    /document\.addEventListener\("visibilitychange", refreshOnVisibility\)/,
  );
  assert.match(workspaceUi, /document\.visibilityState === "visible"/);
  assert.match(workspaceUi, /refreshInFlight\.current/);
  assert.match(
    workspaceUi,
    /window\.removeEventListener\("focus", refreshOnFocus\)/,
  );
  assert.match(
    workspaceUi,
    /document\.removeEventListener\("visibilitychange", refreshOnVisibility\)/,
  );
  assert.match(workspaceUi, /validationRequest<Workspace>/);
  assert.doesNotMatch(
    workspaceUi,
    /setInterval|WebSocket|\.channel\(|postgres_changes/,
  );
  assert.doesNotMatch(workspaceUi, /setData\([^n]/);
});

test("V6.2 choice placeholders remain separate from empty draft values", () => {
  assert.match(adminUi, /x\.options \|\| \["", ""\]/);
  assert.match(adminUi, /value=\{option\}/);
  assert.match(adminUi, /placeholder=\{`Option \$\{optionIndex \+ 1\}`\}/);
  assert.doesNotMatch(adminUi, /\["Option 1",\s*"Option 2"\]/);
  assert.match(adminUi, />\s*Add choice\s*</);
  assert.match(adminUi, />\s*Remove\s*</);
});

test("V6.2 blocks incomplete and duplicate choices beside their question", () => {
  assert.match(adminUi, /options\.some\(\(option\) => !option\.trim\(\)\)/);
  assert.match(adminUi, /new Set\(options\.map\(choiceKey\)\)/);
  assert.match(
    adminUi,
    /Add at least two complete choices before saving this survey\./,
  );
  assert.match(adminUi, /questionErrors\[q\.questionRef\]/);
  assert.match(adminUi, /role="alert"/);
  assert.match(server, /Choice questions need 2–12 options/i);
  assert.match(server, /q\.options\.map\(choiceKey\)/);
});

test("historical literal choice labels remain valid public survey data", () => {
  assert.match(publicUi, /q\.options!\.map\(o=>/);
  assert.doesNotMatch(server, /option===?["']Option [12]/i);
  assert.doesNotMatch(publicUi, /option===?["']Option [12]/i);
});

test("V6 stays bounded away from AI and Data Moat writes", () => {
  const all = [sql, server, publicUi, adminUi].join("\n");
  assert.doesNotMatch(
    all,
    /(?:insert|update|delete).*?(canonical_problems|problem_intelligence|problem_observations|problem_evolution_snapshots|problem_feedback_events)/i,
  );
  assert.doesNotMatch(
    all,
    /openai|openrouter|chat\.completions|responses\.create/i,
  );
});

test("public submission admits only the exact running Survey experiment lineage", () => {
  assert.match(submitFunction, /validation_experiment_versions/);
  for (const edge of [
    "id=pub.experiment_version_id",
    "experiment_id=pub.experiment_id",
    "hypothesis_version_id=pub.hypothesis_version_id",
    "hypothesis_id=pub.hypothesis_id",
    "subject_id=pub.subject_id",
    "owner_id=pub.owner_id",
    "family='survey'",
    "lifecycle='running'",
  ])
    assert.match(submitFunction, new RegExp(edge.replace(/[.]/g, "\\.")));
  assert.doesNotMatch(submitFunction, /lifecycle in\('running','paused'\)/);
  assert.match(
    docs,
    /draft, ready, paused, completed, and cancelled experiments as unavailable/,
  );
});

test("submission lifecycle locking is deterministic and has no V3 reverse-order cycle", () => {
  const publicationLock = submitFunction.indexOf("state='published' for share");
  const lifecycleLock = submitFunction.indexOf(
    "validation_experiment_versions",
    publicationLock,
  );
  assert.ok(
    publicationLock > 0 &&
      lifecycleLock > publicationLock &&
      submitFunction.indexOf("for share", lifecycleLock) > lifecycleLock,
  );
  assert.match(
    submitFunction,
    /V3 lifecycle transitions lock only the[\s\S]+experiment-version row/,
  );
  assert.match(
    docs,
    /never acquire a publication lock, so there is no reverse lock order/,
  );
  const v3 = read(
    "supabase/migrations/20260829000000_validation_server_commands.sql",
  );
  const transition = v3.slice(
    v3.indexOf(
      "create function public.validation_transition_experiment_version",
    ),
    v3.indexOf("create function public.validation_record_observation"),
  );
  assert.match(transition, /update public\.validation_experiment_versions/);
  assert.doesNotMatch(
    transition,
    /validation_survey_publications|validation_experiments[^_]/,
  );
});

test("public projection fails closed for non-running experiments without exposing lifecycle", () => {
  assert.match(server, /from\("validation_experiment_versions"\)/);
  assert.match(server, /eq\("family","survey"\)\.eq\("lifecycle","running"\)/);
  assert.match(server, /This survey is closed or unavailable\./);
  const publicProjection = server.slice(
    server.indexOf("async resolve"),
    server.indexOf("async submit"),
  );
  assert.doesNotMatch(
    publicProjection,
    /return\{[^}]*lifecycle|paused|completed|cancelled/,
  );
});

test("publication guard makes complete authoritative lineage immutable", () => {
  const guard = sql.slice(
    sql.indexOf("create function public.validation_guard_survey_publication"),
    sql.indexOf("create trigger validation_survey_publication_guard"),
  );
  for (const field of [
    "id",
    "owner_id",
    "subject_id",
    "experiment_id",
    "experiment_version_id",
    "hypothesis_id",
    "hypothesis_version_id",
    "survey_plan_version_id",
    "token_hash",
    "published_at",
  ]) {
    assert.match(
      guard,
      new RegExp(`new\\.${field} is distinct from old\\.${field}`),
    );
  }
  assert.match(guard, /old\.state<>'published' or new\.state<>'revoked'/);
  assert.match(guard, /old\.revoked_at is not null or new\.revoked_at is null/);
});

test("only explicit publication of the latest plan replaces the active capability", () => {
  assert.match(publishFunction, /order by version_number desc limit 1/);
  assert.match(publishFunction, /candidate\.id is distinct from latest\.id/);
  assert.match(publishFunction, /stale survey plan cannot be published/);
  const staleCheck = publishFunction.indexOf(
    "stale survey plan cannot be published",
  );
  const revoke = publishFunction.indexOf(
    "update public.validation_survey_publications",
  );
  const replacement = publishFunction.indexOf(
    "insert into public.validation_survey_publications",
  );
  assert.ok(staleCheck > 0 && revoke > staleCheck && replacement > revoke);
  assert.doesNotMatch(
    planFunction,
    /update public\.validation_survey_publications/,
  );
  assert.match(
    publishFunction,
    /only this explicit publish command replaces it/,
  );
  assert.match(submitFunction, /state='published' for share/);
});
