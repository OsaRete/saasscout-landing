import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const app = "http://127.0.0.1:3100";
const backend = "http://127.0.0.1:56321";
test.use({ launchOptions: { executablePath: process.env.BETA_ACCEPTANCE_CHROMIUM }, serviceWorkers: "block" });

test("configured cron persists an insufficient-context report and owner browser reuses it", async ({ page }) => {
  test.skip(process.env.BETA_ACCEPTANCE_BROWSER !== "1" || !process.env.BETA_ACCEPTANCE_WEEKLY_USER_ID,
    "Run via the configured Weekly phase of the owned disposable fixture launcher");
  test.setTimeout(60_000);
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(backend);
  const id = process.env.BETA_ACCEPTANCE_WEEKLY_USER_ID!;
  const admin = createClient(backend, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const external: string[] = [];
  page.on("request", (request) => {
    const origin = new URL(request.url()).origin;
    if (origin !== app && origin !== backend) external.push(origin);
  });
  await page.route("**/*", (route) =>
    [app, backend].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort(),
  );
  const providerLog = () => readFileSync(process.env.BETA_ACCEPTANCE_PROVIDER_LOG!, "utf8");
  const before = providerLog();
  const runs = () => admin.from("weekly_intelligence_runs").select("id,status,summary,execution_mode,spending_execution_attempts").eq("user_id", id);
  expect(await runs()).toMatchObject({ error: null, data: [] });
  const scheduler = `${app}/api/cron`;
  expect((await page.request.get(scheduler, { headers: { Authorization: "Bearer invalid" } })).status()).toBe(401);
  expect(await runs()).toMatchObject({ error: null, data: [] });
  const cron = await page.request.get(scheduler, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(cron.status(), await cron.text()).toBe(200);
  expect(await cron.json()).toMatchObject({ succeeded_count: 1, failed_count: 0, reused_count: 0 });
  const persisted = await runs();
  expect(persisted).toMatchObject({ error: null, data: [{ status: "completed", execution_mode: "insufficient_context", spending_execution_attempts: 1 }] });

  await page.goto(`${app}/login`);
  await page.getByPlaceholder("Email address").fill(process.env.BETA_ACCEPTANCE_WEEKLY_EMAIL!);
  await page.getByPlaceholder("Password", { exact: true }).fill(process.env.BETA_ACCEPTANCE_WEEKLY_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`${app}/dashboard`);
  await page.goto(`${app}/weekly`);
  await expect(page.getByText(persisted.data![0].summary, { exact: true })).toBeVisible();
  const response = page.waitForResponse((value) =>
    value.url() === `${app}/api/weekly-intelligence` && value.request().method() === "POST");
  await page.getByRole("button", { name: "Refresh Weekly Intelligence" }).click();
  const manual = await response;
  expect(manual.status(), await manual.text()).toBe(200);
  expect(await manual.json()).toMatchObject({ reused: true, run: { id: persisted.data![0].id } });
  expect(await runs()).toMatchObject({ error: null, data: persisted.data });
  expect(await admin.from("application_provider_reservations").select("request_id").eq("user_id", id))
    .toMatchObject({ error: null, data: [] });
  expect(providerLog()).toBe(before);
  expect(external).toEqual([]);
});
