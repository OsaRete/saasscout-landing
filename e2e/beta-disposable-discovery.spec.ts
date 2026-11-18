import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const app = "http://127.0.0.1:3100";
const backend = "http://127.0.0.1:56321";
const endpoint = `${app}/api/discover-opportunities`;
test.use({ launchOptions: { executablePath: process.env.BETA_ACCEPTANCE_CHROMIUM }, serviceWorkers: "block" });

test("Discovery persists zero-result runs, rejects ambiguous replay and charges budget denial", async ({ page }) => {
  test.skip(process.env.BETA_ACCEPTANCE_BROWSER !== "1", "Run via the owned disposable fixture launcher");
  test.setTimeout(90_000);
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(backend);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(backend, process.env.SUPABASE_SERVICE_ROLE_KEY!, options);
  const email = `discovery-${randomUUID()}@example.test`;
  const password = "Disposable-discovery-acceptance-81!";
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
  const log = () => readFileSync(process.env.BETA_ACCEPTANCE_PROVIDER_LOG!, "utf8").trim().split("\n").filter(Boolean);
  const before = log().length;
  await page.goto(`${app}/login`);
  await page.getByPlaceholder("Email address").fill(email);
  await page.getByPlaceholder("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "SaaSScout Intelligence Control Center" })).toBeVisible();
  await page.goto(`${app}/discover`);

  let lostKey: string | undefined;
  let lostStatus: number | undefined;
  await page.route(endpoint, async (route) => {
    lostKey = route.request().headers()["idempotency-key"];
    const response = await route.fetch({ maxRedirects: 0 });
    lostStatus = response.status();
    await route.abort("failed");
  }, { times: 1 });
  const run = page.locator("section").filter({
    has: page.getByRole("heading", { name: /Discover SaaS opportunities/ }),
  }).getByRole("button", { name: "Run Discovery" });
  await run.click();
  await expect(page.getByText("Something went wrong analyzing market signals.")).toBeVisible();
  expect(lostStatus).toBe(200);
  expect(lostKey).toMatch(/^[a-f0-9-]{36}$/);

  async function submit() {
    const response = page.waitForResponse((value) => value.url() === endpoint);
    await run.click();
    return response;
  }
  const replay = await submit();
  expect(replay.request().headers()["idempotency-key"]).toBe(lostKey);
  expect(replay.status()).toBe(409);
  const second = await submit();
  expect(second.status(), await second.text()).toBe(200);
  expect(await second.json()).toMatchObject({ success: true });
  await expect(page.getByText(/Discovery completed. Live signals/)).toBeVisible();

  const reserved = await admin.rpc("application_reserve_provider", {
    p_user_id: userId, p_workflow: "discovery", p_request_id: randomUUID(), p_provider: "openrouter", p_slots: 2,
  });
  expect(reserved).toMatchObject({ error: null, data: true });
  const exhausted = await submit();
  expect(exhausted.status()).toBe(503);
  const fourth = await submit();
  expect(fourth.status()).toBe(429);
  const history = await admin.from("opportunity_discoveries").select("user_id,status,total_sources_analyzed")
    .eq("user_id", userId);
  expect(history.error).toBeNull();
  expect(history.data).toHaveLength(2);
  expect(history.data?.every((row) => row.status === "completed" && row.total_sources_analyzed > 0)).toBe(true);
  const admissions = await admin.from("application_discovery_admissions").select("status").eq("user_id", userId);
  expect(admissions.error).toBeNull();
  expect(admissions.data?.map((row) => row.status).sort()).toEqual(["completed", "completed", "failed"]);
  const entries = log().slice(before);
  expect(entries.filter((entry) => entry === "discovery-initial")).toHaveLength(2);
  expect(entries.filter((entry) => entry === "discovery-replacement")).toHaveLength(2);
  const ledger = await admin.from("application_provider_reservations").select("provider,dispatched_at")
    .eq("user_id", userId).eq("workflow", "discovery");
  expect(ledger.error).toBeNull();
  const dispatched = ledger.data!.filter((row) => row.dispatched_at);
  expect(dispatched.filter((row) => row.provider === "openrouter")).toHaveLength(4);
  expect(dispatched.filter((row) => row.provider === "serpapi")).toHaveLength(entries.filter((entry) => entry === "search").length);
  const otherEmail = `discovery-other-${randomUUID()}@example.test`;
  const other = await admin.auth.admin.createUser({ email: otherEmail, password, email_confirm: true });
  expect(other.error).toBeNull();
  const foreign = createClient(backend, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options);
  expect((await foreign.auth.signInWithPassword({ email: otherEmail, password })).error).toBeNull();
  expect(await foreign.from("opportunity_discoveries").select("id").eq("user_id", userId))
    .toMatchObject({ error: null, data: [] });
  expect(external).toEqual([]);
});
