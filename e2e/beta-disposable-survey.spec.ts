import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const app = "http://127.0.0.1:3100";
const backend = "http://127.0.0.1:56321";
test.use({ launchOptions: { executablePath: process.env.BETA_ACCEPTANCE_CHROMIUM },
  viewport: { width: 390, height: 844 }, serviceWorkers: "block" });

test("anonymous survey commits once after lost response, then owner revokes it", async ({ page }) => {
  test.skip(process.env.BETA_ACCEPTANCE_BROWSER !== "1", "Run via the owned disposable fixture launcher");
  test.setTimeout(60_000);
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(backend);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(backend, process.env.SUPABASE_SERVICE_ROLE_KEY!, options);
  const external: string[] = [];
  page.on("request", (request) => {
    const origin = new URL(request.url()).origin;
    if (origin !== app && origin !== backend) external.push(origin);
  });
  await page.route("**/*", (route) => [app, backend].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());

  async function founder() {
    const email = `survey-${randomUUID()}@example.test`;
    const password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    const client = createClient(backend, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options);
    const login = await client.auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull();
    return { id: created.data.user!.id, email, password, headers: { Authorization: `Bearer ${login.data.session!.access_token}` } };
  }
  const owner = await founder();
  const other = await founder();
  const scope = { p_owner_id: owner.id };
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await admin.rpc(name, { ...scope, ...args });
    expect(error).toBeNull();
    return data;
  }
  const subject = await rpc("validation_create_subject", {
    p_creation_origin: "user_entered", p_label: "Disposable founder survey", p_context_snapshot: {},
  });
  const hypothesis = await rpc("validation_create_hypothesis", {
    p_subject_id: subject.id, p_target_segment: "Operators", p_problem_claim: "Reporting is slow",
    p_expected_observable_behavior: "Manual reconciliation", p_commercial_assumption: null,
    p_support_criteria: ["Repeats weekly"], p_contradiction_criteria: ["Automatic"],
    p_inconclusive_criteria: ["Unknown"], p_scope_included: [], p_scope_excluded: [],
  });
  const experiment = await rpc("validation_create_experiment", {
    p_subject_id: subject.id, p_hypothesis_version_id: hypothesis.version.id, p_family: "survey",
    p_target_audience: ["Operators"], p_collection_method: "Survey", p_design_snapshot: {},
    p_screening_criteria: [], p_consent_privacy_mode: "anonymous_notes",
  });
  for (const [from, to] of [["draft", "ready"], ["ready", "running"]]) {
    await rpc("validation_transition_experiment_version", {
      p_version_id: experiment.version.id, p_expected_lifecycle: from, p_target_lifecycle: to,
    });
  }
  const title = "Disposable reporting research";
  await page.goto(`${app}/login`);
  await page.getByPlaceholder("Email address").fill(owner.email);
  await page.getByPlaceholder("Password", { exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`${app}/dashboard`);
  await page.goto(`${app}/validation`);
  await expect(page.getByRole("heading", { name: "Validation Hub" })).toBeVisible();
  const picker = page.getByRole("region", { name: "Choose a validation method" });
  await expect(picker.getByRole("button", { name: /^Choose / })).toHaveCount(6);
  await expect(picker.getByRole("button", { name: /^Choose /, disabled: true })).toHaveCount(0);
  await page.goto(`${app}/validation/${subject.id}`);
  await page.getByLabel("Participant-facing title").fill(title);
  await page.getByLabel("Research purpose").fill("Understand reporting");
  const questions = [
    { prompt: "What happened?", type: "short_text" },
    { prompt: "Describe it", type: "long_text" },
    { prompt: "How many hours?", type: "number" },
    { prompt: "How often?", type: "single_choice", options: ["Weekly", "Monthly"] },
    { prompt: "What tools?", type: "multiple_choice", options: ["Spreadsheet", "Email"] },
  ];
  for (const [i, question] of questions.entries()) {
    await page.getByRole("button", { name: "Add question" }).click();
    await page.getByLabel(`Question ${i + 1}`, { exact: true }).fill(question.prompt);
    await page.getByLabel(`Question ${i + 1} type`).selectOption(question.type);
    for (const [j, option] of (question.options || []).entries()) {
      await page.getByLabel(`Question ${i + 1} option ${j + 1}`).fill(option);
    }
    await page.getByRole("checkbox", { name: "Required", exact: true }).nth(i).check();
  }
  const save = page.waitForResponse((response) => response.url().endsWith("/api/validation/survey-plans"));
  await page.getByRole("button", { name: "Save immutable plan" }).click();
  expect((await save).status()).toBe(200);
  await page.reload();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  const publicationResponse = page.waitForResponse((response) => response.url().endsWith("/api/validation/survey-publications"));
  await page.getByRole("button", { name: "Publish public link" }).click();
  const publication = await publicationResponse;
  expect(publication.status(), await publication.text()).toBe(200);
  const { data: published } = await publication.json();
  await page.evaluate(() => localStorage.clear());
  await page.context().clearCookies();
  expect(published.publicPath).toMatch(/^\/validation\/survey\/[A-Za-z0-9_-]+$/);
  const revokeUrl = `${app}/api/validation/survey-publications/${published.id}/revoke`;
  expect((await page.request.post(revokeUrl, { headers: other.headers, maxRedirects: 0 })).status()).toBe(404);

  const submissions = () => admin.from("validation_survey_submissions").select("id,owner_id,experiment_version_id,consent_notice_version,submitted_at").eq("publication_id", published.id);
  let submittedBody: string | null = null;
  let committedStatus: number | undefined;
  await page.route("**/api/public/surveys/*/responses", async (route) => {
    if (submittedBody === null) {
      submittedBody = route.request().postData();
      const committed = await route.fetch({ maxRedirects: 0 });
      committedStatus = committed.status();
      await route.abort("failed");
      return;
    }
    expect(route.request().postData()).toBe(submittedBody);
    await route.continue();
  });

  await page.goto(`${app}${published.publicPath}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const submit = page.getByRole("button", { name: "Submit response" });
  await submit.click();
  expect(await submissions()).toMatchObject({ error: null, data: [] });
  await page.getByRole("textbox").nth(0).fill("Manual reporting");
  await page.getByRole("textbox").nth(1).fill("The team reconciles two spreadsheets every Friday.");
  await page.getByRole("spinbutton").fill("2");
  await page.getByRole("radio", { name: "Weekly" }).check();
  await page.getByRole("checkbox", { name: "Spreadsheet" }).check();
  const consent = page.getByRole("checkbox", { name: "I agree to share my answers with the survey creator for this research.", exact: true });
  await expect(consent).not.toBeChecked();
  await submit.click();
  await expect(consent).toBeFocused();
  expect(submittedBody).toBeNull();
  await consent.check();
  await submit.click();
  const retry = page.getByRole("button", { name: "Retry same response" });
  await expect(retry).toBeVisible();
  expect(committedStatus).toBe(200);
  const beforeRetry = await submissions();
  expect(beforeRetry).toMatchObject({ error: null, data: [{ owner_id: owner.id, experiment_version_id: experiment.version.id }] });
  expect(beforeRetry.data![0].consent_notice_version).toBe("survey-participation-v1");
  expect(beforeRetry.data![0].submitted_at).toEqual(expect.any(String));
  const retried = page.waitForResponse((response) => response.url().endsWith("/responses") && response.request().method() === "POST");
  await retry.click();
  const retryResponse = await retried;
  expect(retryResponse.status()).toBe(200);
  expect(await retryResponse.json()).toMatchObject({ data: { accepted: true, duplicate: true } });
  await expect(page.getByText("Your research response was submitted successfully.")).toBeVisible();
  expect(await submissions()).toMatchObject({ error: null, data: beforeRetry.data });
  const answers = await admin.from("validation_survey_answers").select("id").eq("submission_id", beforeRetry.data![0].id);
  expect(answers.error).toBeNull();
  expect(answers.data).toHaveLength(5);
  expect((await page.request.post(revokeUrl, { headers: owner.headers, maxRedirects: 0 })).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Survey unavailable" })).toBeVisible();
  expect(await submissions()).toMatchObject({ error: null, data: beforeRetry.data });
  expect(external).toEqual([]);
});
