import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

test.use({ launchOptions: { executablePath: process.env.BETA_ACCEPTANCE_CHROMIUM } });

const app = "http://127.0.0.1:3100";
const auth = "http://127.0.0.1:56321";
const password = "Disposable-account-test-41!";
const dashboard = "SaaSScout Intelligence Control Center";

async function credentials(page: Page, email: string, action: "Sign in" | "Create account") {
  await page.getByPlaceholder("Email address").fill(email);
  await page.getByPlaceholder("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: action, exact: true }).click();
}

test("disposable Auth, profiles and saved opportunities across two browser identities", async ({ browser }) => {
  test.skip(process.env.BETA_ACCEPTANCE_BROWSER !== "1", "Run via the owned disposable fixture launcher");
  test.setTimeout(60_000);
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(auth);
  const admin = createClient(auth, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const desktop = await browser.newContext({ serviceWorkers: "block" });
  const mobile = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  const external: string[] = [];
  for (const context of [desktop, mobile]) {
    const allowed = (url: string) => [app, auth].includes(new URL(url).origin);
    context.on("request", (request) => {
      if (!allowed(request.url())) external.push(new URL(request.url()).origin);
    });
    await context.route("**/*", (route) =>
      allowed(route.request().url()) ? route.continue() : route.abort(),
    );
  }
  const email = `browser-${randomUUID()}@example.test`;
  const secondEmail = `browser-${randomUUID()}@example.test`;
  try {
    const first = await desktop.newPage();
    await first.goto(`${app}/login`);
    await first.getByRole("button", { name: /create one/i }).click();
    await credentials(first, email, "Create account");
    await expect(first.getByText(/account created/i)).toBeVisible();
    await first.getByRole("button", { name: /already have an account/i }).click();
    await credentials(first, email, "Sign in");
    await expect(first.getByRole("heading", { name: dashboard })).toBeVisible();
    await expect(first.getByText("No saved ideas yet")).toBeVisible();

    const signed = createClient(auth, anon, { auth: { autoRefreshToken: false, persistSession: false } });
    const identity = await signed.auth.signInWithPassword({ email, password });
    expect(identity.error).toBeNull();
    const ownerId = identity.data.user!.id;
    await first.goto(`${app}/founder-profile`);
    const skills = first.getByPlaceholder(/React, Next.js/);
    for (const value of ["Browser profile draft", "Browser profile revision"]) {
      await skills.fill(value);
      await first.getByRole("button", { name: "Save Founder Profile" }).click();
      await expect(first.getByText("Founder profile saved successfully.")).toBeVisible();
      const row = await admin.from("founder_profiles").select("technical_skills").eq("user_id", ownerId).single();
      expect(row.error).toBeNull();
      expect(row.data?.technical_skills).toBe(value);
    }
    await first.reload();
    await expect(skills).toHaveValue("Browser profile revision");

    const second = await mobile.newPage();
    const pending = await admin.auth.admin.createUser({ email: secondEmail, password, email_confirm: false });
    expect(pending.error).toBeNull();
    await second.goto(`${app}/login`);
    await credentials(second, secondEmail, "Sign in");
    await expect(second.getByText(/email not confirmed/i)).toBeVisible();
    expect((await admin.auth.admin.updateUserById(pending.data.user!.id, { email_confirm: true })).error).toBeNull();
    await credentials(second, secondEmail, "Sign in");
    await expect(second.getByRole("heading", { name: dashboard })).toBeVisible();
    await second.goto(`${app}/founder-profile`);
    await expect(second.getByPlaceholder(/React, Next.js/)).toHaveValue("");
    const jwtClient = createClient(auth, anon, { auth: { autoRefreshToken: false, persistSession: false } });
    expect((await jwtClient.auth.signInWithPassword({ email: secondEmail, password })).error).toBeNull();
    const foreign = await jwtClient.from("founder_profiles").select("user_id").eq("user_id", ownerId);
    expect(foreign.error).toBeNull();
    expect(foreign.data).toEqual([]);

    const opportunityId = randomUUID();
    const title = "Disposable opportunity for a founder";
    const opportunityPath = `${app}/opportunity/${opportunityId}`;
    const seeded = await admin.from("opportunities").insert({ id: opportunityId, user_id: ownerId, title });
    expect(seeded.error).toBeNull();

    await first.goto(opportunityPath);
    const save = first.getByRole("button", { name: "Save Idea", exact: true });
    await first.route("**/api/saved-ideas", (route) => route.fulfill({ status: 503 }), { times: 1 });
    await save.click();
    await expect(first.getByText("Could not save this idea. Please try again.")).toBeVisible();
    const savedRows = () => admin.from("saved_ideas").select("user_id").eq("opportunity_id", opportunityId);
    expect(await savedRows()).toMatchObject({ error: null, data: [] });
    const retryResponse = first.waitForResponse((response) =>
      response.url() === `${app}/api/saved-ideas` && response.request().method() === "POST",
    );
    await save.click();
    const saved = await retryResponse;
    expect(saved.status(), await saved.text()).toBe(200);
    await expect(first.getByText("Idea saved successfully.")).toBeVisible();
    expect(await savedRows()).toMatchObject({ error: null, data: [{ user_id: ownerId }] });

    await second.goto(opportunityPath);
    await expect(second.getByRole("heading", { name: "Opportunity not found" })).toBeVisible();
    await second.goto(`${app}/saved`);
    await expect(second.getByText("No saved ideas yet")).toBeVisible();

    await first.goto(`${app}/saved`);
    await expect(first.getByText(title, { exact: true })).toBeVisible();
    await first.getByRole("link", { name: "View Details" }).click();
    await expect(first.getByText("Idea already saved.")).toBeVisible();
    await first.goto(`${app}/saved`);
    first.once("dialog", (dialog) => dialog.accept());
    await first.getByRole("button", { name: "Remove from Saved" }).click();
    await expect(first.getByText("No saved ideas yet")).toBeVisible();
    expect(await savedRows()).toMatchObject({ error: null, data: [] });

    const invalid = await second.request.get(`${app}/api/user/capabilities`, {
      headers: { Authorization: "Bearer invalid-disposable-session" },
    });
    expect(invalid.status()).toBe(401);
    const cron = await second.request.get(`${app}/api/cron`);
    expect(cron.status()).toBe(500);
    expect(await cron.json()).toMatchObject({ code: "weekly_schedule_configuration_invalid" });

    const quota = await admin.from("user_profiles").update({ scan_limit: 0 }).eq("user_id", pending.data.user!.id);
    expect(quota.error).toBeNull();
    await second.goto(`${app}/scan`);
    await expect(second.getByText(/0 scans left this UTC month/i)).toBeVisible();
    const submitScan = second.getByRole("button", { name: "Find Opportunities" });
    await expect(submitScan).toBeDisabled();
    await second.getByPlaceholder(/Context: Freelance designers/).fill("Independent bookkeeping");
    await second.getByPlaceholder(/Example: Paste Reddit posts/).fill(
      "A bookkeeper reported spending two hours reconciling duplicate invoices every Friday.",
    );
    await submitScan.click();
    await expect(second.getByText("You have reached your plan Scan limit.")).toBeVisible();
    const deniedScans = await admin.from("scan").select("id").eq("user_id", pending.data.user!.id);
    expect(deniedScans).toMatchObject({ error: null, data: [] });

    expect((await admin.auth.admin.updateUserById(pending.data.user!.id, { ban_duration: "1h" })).error).toBeNull();
    await second.goto(`${app}/dashboard`);
    await expect(second.getByText(/verify your email to continue/i)).toBeVisible();

    await first.goto(`${app}/dashboard`);
    await first.getByRole("button", { name: "Logout" }).click();
    await expect(first).toHaveURL(`${app}/login`);
    await first.goto(`${app}/dashboard`);
    await expect(first).toHaveURL(`${app}/login`);

    const recovery = await admin.auth.admin.generateLink({
      type: "recovery", email, options: { redirectTo: `${app}/update-password` },
    });
    expect(recovery.error).toBeNull();
    const recoveryUrl = new URL(recovery.data.properties!.action_link);
    expect(recoveryUrl.origin).toBe(auth);
    // GoTrue reports its native endpoint. The disposable gateway adds the Supabase Auth prefix.
    if (recoveryUrl.pathname === "/verify") recoveryUrl.pathname = "/auth/v1/verify";
    await first.goto(recoveryUrl.toString());
    await expect(first.getByRole("heading", { name: "Create a new password" })).toBeVisible();
    const nextPassword = "Disposable-recovered-account-42!";
    await first.getByPlaceholder("New password", { exact: true }).fill(nextPassword);
    await first.getByPlaceholder("Confirm new password").fill(nextPassword);
    await first.getByRole("button", { name: "Update password" }).click();
    await expect(first.getByText("Password updated successfully.")).toBeVisible();
    expect((await signed.auth.signInWithPassword({ email, password })).error).toBeTruthy();
    expect((await signed.auth.signInWithPassword({ email, password: nextPassword })).error).toBeNull();
  } finally {
    await Promise.all([desktop.close(), mobile.close()]);
    expect(external, "Unexpected browser destinations").toEqual([]);
  }
});
