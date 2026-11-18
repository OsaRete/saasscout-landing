import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const app = "http://127.0.0.1:3100";
const backend = "http://127.0.0.1:56321";

test.use({ launchOptions: { executablePath: process.env.BETA_ACCEPTANCE_CHROMIUM }, serviceWorkers: "block" });

test("Scan browser submits, reserves, persists, reuses, retries and exhausts quota", async ({ page }) => {
  test.skip(process.env.BETA_ACCEPTANCE_BROWSER !== "1", "Run via the owned disposable fixture launcher");
  test.setTimeout(90_000);
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(backend);
  const admin = createClient(backend, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = `scan-${randomUUID()}@example.test`;
  const password = "Disposable-scan-acceptance-12!";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const userId = created.data.user!.id;
  const external: string[] = [];
  page.on("request", (request) => {
    const origin = new URL(request.url()).origin;
    if (origin !== app && origin !== backend) external.push(origin);
  });
  await page.route("**/*", (route) =>
    [app, backend].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort(),
  );

  const providerLog = () => readFileSync(process.env.BETA_ACCEPTANCE_PROVIDER_LOG!, "utf8").trim().split("\n").filter(Boolean);
  const before = providerLog().length;
  await page.goto(`${app}/login`);
  await page.getByPlaceholder("Email address").fill(email);
  await page.getByPlaceholder("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "SaaSScout Intelligence Control Center" })).toBeVisible();

  async function submit(market: string, upload = false) {
    await page.goto(`${app}/scan`);
    await page.getByPlaceholder(/Context: Freelance designers/).fill(market);
    const evidence = "Agency operators manually build weekly reports from spreadsheets.";
    if (upload) {
      await page.locator('input[type="file"]').setInputFiles({
        name: "founder-notes.txt", mimeType: "text/plain", buffer: Buffer.from(evidence),
      });
    } else {
      await page.getByPlaceholder(/Example: Paste Reddit posts/).fill(evidence);
    }
    const response = page.waitForResponse((value) => value.url() === `${app}/api/scan/workflow`);
    await page.getByRole("button", { name: "Find Opportunities" }).click();
    return response;
  }

  const first = await submit("Agency reporting acceptance", true);
  const result = await first.json();
  expect(first.status(), JSON.stringify(result)).toBe(200);
  expect(result.workflow).toMatchObject({ status: "completed", problemIntelligence: { inferred_market: "Agency ops" },
    solutionIntelligence: { recommendedCategory: "validate_first" } });
  await expect(page).toHaveURL(`${app}/results`);
  await page.reload();
  await expect(page.getByText("Agency reporting acceptance", { exact: false }).first()).toBeVisible();

  const reused = await submit("Agency reporting acceptance", true);
  expect(await reused.json()).toMatchObject({ scanId: result.scanId, reused: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const failure = await submit("Fixture provider failure");
    expect(failure.ok()).toBe(false);
    expect((await failure.json()).error.stage).toBe("problem_intelligence_started");
  }
  const denied = await submit("Fourth monthly admission");
  expect(denied.status()).toBe(402);
  expect(await denied.json()).toMatchObject({ error: { code: "scan_acceptance_limit_exceeded" } });
  await expect(page.getByText("You have reached your plan Scan limit.")).toBeVisible();

  const scans = await admin.from("scan").select("id,status").eq("user_id", userId);
  expect(scans.error).toBeNull();
  expect(scans.data?.map((row) => row.status).sort()).toEqual(["completed", "failed", "failed"]);
  expect(await admin.from("evidence_analysis").select("inferred_market").eq("scan_id", result.scanId))
    .toMatchObject({ error: null, data: [{ inferred_market: "Agency ops" }] });
  const opportunities = await admin.from("opportunities").select("id").eq("scan_id", result.scanId).eq("user_id", userId);
  expect(opportunities.error).toBeNull();
  expect(opportunities.data).toHaveLength(3);
  const ledger = await admin.from("application_provider_reservations").select("request_id,dispatched_at,finished_at")
    .eq("user_id", userId).eq("workflow", "scan");
  expect(ledger.error).toBeNull();
  expect(ledger.data).toHaveLength(6);
  expect(ledger.data?.filter((row) => row.dispatched_at)).toHaveLength(4);
  expect(ledger.data?.filter((row) => row.finished_at)).toHaveLength(2);
  expect(providerLog().slice(before)).toEqual(["problem", "solution", "problem", "problem"]);
  expect(external).toEqual([]);
});
