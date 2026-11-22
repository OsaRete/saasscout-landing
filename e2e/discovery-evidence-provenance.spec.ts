import { expect, test } from "@playwright/test";

const base = process.env.DISCOVERY_PROVENANCE_UI_BASE;
const backend = "https://discovery-fixture.supabase.co";
test.skip(!base, "Run against a local app built with the Discovery fixture Supabase URL");
test.use({
  launchOptions: { executablePath: process.env.DISCOVERY_PROVENANCE_CHROMIUM },
  serviceWorkers: "block",
});

test("Discovery reports missing sources and labels saved synthesis without traceable evidence", async ({ page }) => {
  const user = { id: "owner-fixture", email: "owner@example.test" };
  const savedRun = { id: "saved-run", created_at: "2026-11-20", total_sources_analyzed: 1 };
  const newRun = { id: "new-run", created_at: "2026-11-21", total_sources_analyzed: 1 };
  let hasNewRun = false;
  let submissions = 0;

  await page.addInitScript((fixtureUser) => {
    localStorage.setItem("sb-discovery-fixture-auth-token", JSON.stringify({
      user: fixtureUser,
      access_token: "fixture-access",
      refresh_token: "fixture-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    }));
  }, user);

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === backend) {
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, headers });
      }
      switch (url.pathname) {
        case "/auth/v1/user":
          return route.fulfill({ headers, json: user });
        case "/rest/v1/user_profiles":
          return route.fulfill({ headers, json: [{ plan: "free", external_sources_limit: 10 }] });
        case "/rest/v1/opportunity_discoveries":
          return route.fulfill({ headers, json: hasNewRun ? [newRun, savedRun] : [savedRun] });
        case "/rest/v1/discovered_problems":
          return route.fulfill({ headers, json: [
            { id: "old", discovery_id: savedRun.id, problem_title: "Saved reporting opportunity",
              source_evidence: "External and internal signals suggest repeated workflow friction." },
            ...(hasNewRun ? [{ id: "new", discovery_id: newRun.id, problem_title: "Weekly reporting reconciliation",
              source_evidence: "", opportunity_score: 90 }] : []),
          ] });
        default:
          return route.fulfill({ headers, json: [] });
      }
    }
    if (url.origin !== new URL(base!).origin) return route.abort();
    if (url.pathname === "/api/user/capabilities") return route.fulfill({ json: {} });
    if (url.pathname === "/api/discover-opportunities") {
      submissions++;
      if (submissions === 1) return route.fulfill({ json: {
        success: true, outcome: "insufficient_evidence", discovery: null, problems: [],
        external_sources_analyzed: 0, data_moat_sources_used: 0,
      } });
      hasNewRun = true;
      return route.fulfill({ json: { success: true, discovery: newRun } });
    }
    return route.continue();
  });

  await page.goto(`${base}/discover`);
  await expect(page.getByRole("heading", { name: "Saved reporting opportunity" })).toBeVisible();
  await expect(page.getByText("External and internal signals suggest repeated workflow friction.")).toHaveCount(0);

  const run = page.getByRole("button", { name: "Run Discovery" });
  await run.click();
  await expect(page.getByText(/Insufficient evidence.*no opportunities were generated/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved reporting opportunity" })).toBeVisible();
  await expect(page.getByText("1 run", { exact: true })).toBeVisible();

  await run.click();
  await expect(page.getByRole("heading", { name: "Weekly reporting reconciliation" })).toBeVisible();
  await expect(page.getByText("Unverified interpretation")).toBeVisible();
  await expect(page.getByText("No traceable source evidence is available for this opportunity.")).toBeVisible();
  await expect(page.getByText("High-confidence opportunity")).toHaveCount(0);
});
