import { test, expect } from "@playwright/test";

const base = process.env.BETA_MEMBERSHIP_UI_BASE;
test.skip(!base, "Local synthetic membership UI app required");
test.use({ launchOptions: { executablePath: process.env.BETA_MEMBERSHIP_CHROMIUM_PATH || undefined } });

test("signed-out workspace blocks child database calls while recovery stays available", async ({ page }) => {
  let protectedReads = 0;
  await page.route("**/rest/v1/**", (route) => { protectedReads += 1; return route.abort(); });
  await page.goto(`${base}/dashboard`);
  await expect(page.getByRole("link", { name: "Sign in to check your Beta access" })).toBeVisible();
  expect(protectedReads).toBe(0);
  for (const path of ["/login", "/reset-password", "/update-password"]) {
    await page.goto(`${base}${path}`);
    await expect(page.getByRole("heading").last()).toBeVisible();
    await expect(page.getByText("An active Beta invitation is required.")).toHaveCount(0);
  }
});

test("same session: denied, admitted, then revoked; children mount only after admission", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sb-placeholder-auth-token", JSON.stringify({
      access_token: "synthetic-token", token_type: "bearer", refresh_token: "synthetic-refresh",
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "fixture-owner", email: "fixture@example.test" },
    }));
  });
  let admitted = false;
  let reads = 0;
  let writes = 0;
  await page.route("**/auth/v1/user", (route) => route.fulfill({ json: { id: "fixture-owner", email: "fixture@example.test" } }));
  await page.route("**/api/user/capabilities", (route) => route.fulfill({ status: admitted ? 200 : 403, json: admitted ? { capabilities: {} } : { error: "Invitation required" } }));
  await page.route("**/rest/v1/**", (route) => {
    if (route.request().method() === "GET") reads += 1; else writes += 1;
    return route.fulfill({ json: null });
  });
  await page.goto(`${base}/founder-profile`);
  await expect(page.getByText(/An active Beta invitation is required/)).toBeVisible();
  expect(reads).toBe(0);
  admitted = true;
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByRole("heading", { name: "Founder Profile", exact: true })).toBeVisible();
  await expect.poll(() => reads).toBeGreaterThan(0);
  const previousReads = reads;
  admitted = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText(/An active Beta invitation is required/)).toBeVisible();
  expect(reads).toBe(previousReads);
  expect(writes).toBe(0);
});

test("default-off Validation and participant page never request founder admission", async ({ page }) => {
  let membershipCalls = 0;
  await page.route("**/api/user/capabilities", (route) => { membershipCalls += 1; return route.abort(); });
  for (const path of ["/validation", "/validation/new", "/validation/survey/synthetic-token", "/validation/landing/synthetic-token"]) {
    await page.goto(`${base}${path}`);
    await expect(page.getByText(/unavailable/i).first()).toBeVisible();
  }
  expect(membershipCalls).toBe(0);
});
