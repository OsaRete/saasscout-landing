import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { commercialIntentTemplate } from "../lib/validation/commercial-intent";
import { externalMvpTemplate } from "../lib/validation/external-mvp";
import { LANDING_CONSENT } from "../lib/validation/landing-pages";
import { prototypeTemplate } from "../lib/validation/prototypes";

// Next emits localhost as its request origin when bound to loopback.
const app = "http://localhost:3100";
const backend = "http://127.0.0.1:56321";
test.use({ launchOptions: { executablePath: process.env.BETA_ACCEPTANCE_CHROMIUM },
  viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
test.skip(process.env.BETA_ACCEPTANCE_BROWSER !== "1", "Run via the owned disposable fixture launcher");

async function fixture(page: Page, family: string) {
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(backend);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(backend, process.env.SUPABASE_SERVICE_ROLE_KEY!, options);
  async function founder() {
    const email = `validation-${randomUUID()}@example.test`;
    const password = "Disposable-validation-77!";
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    const client = createClient(backend, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options);
    const login = await client.auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull();
    return { id: created.data.user!.id, email, password, headers: { Authorization: `Bearer ${login.data.session!.access_token}` } };
  }
  const owner = await founder();
  const stranger = await founder();
  const external: string[] = [];
  page.on("request", (request) => {
    const origin = new URL(request.url()).origin;
    if (origin !== app && origin !== backend) external.push(origin);
  });
  await page.route("**/*", (route) =>
    [app, backend].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort(),
  );
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await admin.rpc(name, { p_owner_id: owner.id, ...args });
    expect(error).toBeNull();
    return data;
  }
  const subject = await rpc("validation_create_subject", {
    p_creation_origin: "user_entered", p_label: "Disposable validation study", p_context_snapshot: {},
  });
  const hypothesis = await rpc("validation_create_hypothesis", {
    p_subject_id: subject.id, p_target_segment: "Operators", p_problem_claim: "Reporting is slow",
    p_expected_observable_behavior: "Manual reconciliation", p_commercial_assumption: null,
    p_support_criteria: ["Repeats weekly"], p_contradiction_criteria: ["Automatic"],
    p_inconclusive_criteria: ["Unknown"], p_scope_included: [], p_scope_excluded: [],
  });
  const experiment = await rpc("validation_create_experiment", {
    p_subject_id: subject.id, p_hypothesis_version_id: hypothesis.version.id, p_family: family,
    p_target_audience: ["Operators"], p_collection_method: "Private acceptance fixture", p_design_snapshot: {},
    p_screening_criteria: [], p_consent_privacy_mode: family === "customer_interview" ? "anonymous_notes" : "identified_with_explicit_consent",
  });
  const versionId: string = experiment.version.id;
  for (const [from, to] of [["draft", "ready"], ["ready", "running"]]) {
    await rpc("validation_transition_experiment_version", {
      p_version_id: versionId, p_expected_lifecycle: from, p_target_lifecycle: to,
    });
  }
  return { admin, owner, stranger, subjectId: subject.id as string, versionId, external };
}

const landing = {
  template: "spotlight", headline: "Disposable Reporting Waitlist", description: "Share research interest in reporting.",
  benefits: ["Save reporting time"], cta: "Join the waitlist", visual: "", consent: LANDING_CONSENT, minimumVisitors: 100, targetRate: 10,
};
const prototype = prototypeTemplate("workflow");
const externalMvp = { ...externalMvpTemplate(), url: "https://example.com/try" };
const commercial = commercialIntentTemplate();

const publicMethods = [
  { family: "landing_waitlist", endpoint: "landing-pages", table: "landing", title: landing.headline, content: landing, success: "Thank you. Your interest has been recorded." },
  { family: "interactive_prototype", endpoint: "prototypes", table: "prototype", title: prototype.title, content: prototype, success: "Thank you for your feedback." },
  { family: "external_mvp", endpoint: "external-mvp", table: "external_mvp", title: externalMvp.title, content: externalMvp, success: "Thank you for your feedback." },
  { family: "commercial_intent", endpoint: "commercial-intent", table: "commercial_intent", title: commercial.title, content: commercial, success: "Thank you for your response." },
] as const;

for (const method of publicMethods) {
  test(`${method.family} publishes, persists consented feedback and closes`, async ({ page }) => {
    test.setTimeout(60_000);
    const { admin, owner, stranger, versionId, external } = await fixture(page, method.family);
    const resource = `${app}/api/validation/${method.endpoint}/${versionId}`;
    const post = (action: string, data: unknown) => page.request.post(`${resource}/${action}`, { headers: owner.headers, data, maxRedirects: 0 });
    const save = await post("save", { revision: 0, content: method.content });
    expect(save.status(), await save.text()).toBe(200);
    const publish = await post("publish", { revision: 1 });
    expect(publish.status(), await publish.text()).toBe(200);
    const { data: published } = await publish.json();
    expect(published.publicPath).toMatch(/^\/validation\/[a-z-]+\/[A-Za-z0-9_-]+$/);
    const denied = await page.request.get(resource, { headers: stranger.headers, maxRedirects: 0 });
    expect(denied.status()).toBe(404);

    await page.goto(`${app}${published.publicPath}`);
    await expect(page.getByRole("heading", { name: method.title })).toBeVisible();
    const count = () => admin.from(`validation_${method.table}_submissions`)
      .select("id,publication_id,owner_id").eq("owner_id", owner.id);
    expect(await count()).toMatchObject({ error: null, data: [] });
    if (method.table === "landing") {
      const send = page.getByRole("button", { name: landing.cta });
      await expect(send).toBeDisabled();
      await page.getByLabel("Email address").fill("waitlist@example.test");
      await page.getByRole("checkbox").check();
      await expect(send).toBeEnabled();
      await send.click();
    } else if (method.table === "prototype") {
      const explore = page.getByRole("button", { name: "Explore prototype" });
      await expect(explore).toBeDisabled();
      await page.getByRole("checkbox").check();
      await explore.click();
      await page.getByRole("button", { name: "Get started" }).click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Task complete" })).toBeVisible();
      await page.getByLabel("Could you complete the task?").selectOption("partly");
      await page.getByLabel("What worked, what was confusing, and what would you change?").fill("The next step was unclear.");
      await page.getByRole("button", { name: "Send feedback" }).click();
    } else {
      const isMvp = method.table === "external_mvp";
      if (isMvp) {
        await expect(page.getByRole("link", { name: /Open external MVP/ })).toHaveAttribute("href", externalMvp.url);
        await page.getByLabel("Did you complete the task? (self-reported)").selectOption("not_tried");
      } else {
        await expect(page.getByText(/No purchase, payment, reservation/)).toBeVisible();
        await page.getByLabel("Your nonbinding response").selectOption("interested");
      }
      for (const question of method.content.questions) {
        await page.getByLabel(question, { exact: true }).fill("The manual process already works.");
      }
      const send = page.getByRole("button", { name: isMvp ? "Send feedback" : "Submit nonbinding response" });
      await expect(send).toBeDisabled();
      await page.getByLabel(method.content.consent, { exact: true }).check();
      await page.getByLabel("Email for follow-up (optional)").fill("participant@example.test");
      await expect(send).toBeDisabled();
      await page.getByRole("checkbox", { name: /I agree to share my email/ }).check();
      await expect(send).toBeEnabled();
      await send.click();
    }
    await expect(page.getByText(method.success, { exact: true })).toBeVisible();
    const rows = await count();
    expect(rows).toMatchObject({ error: null, data: [{ owner_id: owner.id, publication_id: published.publication.id }] });
    if (method.table === "landing") {
      const remove = await post("remove", { revision: 1, submissionId: rows.data![0].id });
      expect(remove.status(), await remove.text()).toBe(200);
      expect(await count()).toMatchObject({ error: null, data: [] });
    }
    if (method.table === "external_mvp" || method.table === "commercial_intent") {
      const details = () => admin.from(`validation_${method.table}_submissions`)
        .select("payload,email,contact_removed").eq("id", rows.data![0].id).single();
      const before = await details();
      expect(before).toMatchObject({ error: null, data: { email: "participant@example.test", contact_removed: false } });
      const remove = await post("remove", { revision: 1, submissionId: rows.data![0].id });
      expect(remove.status(), await remove.text()).toBe(200);
      expect(await details()).toMatchObject({ error: null, data: { email: null, contact_removed: true, payload: before.data!.payload } });
    }
    const close = await post("unpublish", { revision: 1 });
    expect(close.status(), await close.text()).toBe(200);
    if (method.table !== "landing") expect(await count()).toMatchObject({ error: null, data: rows.data });
    await page.reload();
    await expect(page.getByText(/closed or unavailable|This page is unavailable/).first()).toBeVisible();
    expect(external).toEqual([]);
  });
}

test("interview plan, private observations and explicit polarity persist across reload", async ({ page }) => {
  test.setTimeout(75_000);
  const { admin, owner, stranger, subjectId, versionId, external } = await fixture(page, "customer_interview");
  await page.goto(`${app}/login`);
  await page.getByPlaceholder("Email address").fill(owner.email);
  await page.getByPlaceholder("Password", { exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`${app}/dashboard`);
  await page.goto(`${app}/validation/${subjectId}`);
  await page.getByLabel(/Primary questions/).fill("How did you complete last week's report?");
  await page.getByRole("button", { name: "Save plan version" }).click();
  await expect(page.getByText("Interview plan saved.")).toBeVisible();
  await page.getByLabel(/Optional research alias/).fill("Operator A");
  await page.getByRole("button", { name: "Create participant" }).click();
  await expect(page.getByText("Participant created and selected.")).toBeVisible();
  await page.getByRole("button", { name: "Create interview" }).click();
  await page.getByRole("button", { name: "Start interview" }).click();
  for (const [polarity, content] of [
    ["supporting", "Two spreadsheets were reconciled manually every Friday."],
    ["contradicting", "Another team generates the entire report automatically."],
    ["mixed", "Manual approval remains but collection is automated."],
  ]) {
    await page.getByLabel(/Private observation content/).fill(content);
    await page.getByLabel("Optional classification").selectOption(polarity);
    await page.getByRole("button", { name: "Record immutable observation" }).click();
    await expect(page.getByText("Observation recorded. The form is ready for new evidence.")).toBeVisible();
  }
  await page.getByRole("button", { name: "Complete interview" }).click();
  await expect(page.getByText("Interview completed.")).toBeVisible();
  const session = await admin.from("validation_interview_sessions").select("id,status,participant_id,interview_plan_version_id")
    .eq("experiment_version_id", versionId).single();
  expect(session).toMatchObject({ error: null, data: { status: "completed", participant_id: expect.any(String), interview_plan_version_id: expect.any(String) } });
  const observations = await admin.from("validation_evidence_observations").select("id").eq("interview_session_id", session.data!.id);
  expect(observations.error).toBeNull();
  expect(observations.data).toHaveLength(3);
  const classifications = await admin.from("validation_evidence_classifications").select("polarity")
    .in("observation_id", observations.data!.map((row) => row.id));
  expect(classifications.error).toBeNull();
  expect(classifications.data?.map((row) => row.polarity).sort()).toEqual(["contradicting", "mixed", "supporting"]);
  await page.reload();
  await expect(page.getByText("How did you complete last week's report?")).toBeVisible();
  const restricted = await page.request.get(`${app}/api/validation/subjects/${subjectId}`, { headers: stranger.headers });
  expect(restricted.status()).toBe(404);
  expect(external).toEqual([]);
});
