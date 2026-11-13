import { test, expect } from "@playwright/test";
// Local-only UI acceptance. API fixtures isolate layout/form behavior; SQL and server
// authority are independently exercised by validation-landing-db and node tests.
const base = process.env.VALIDATION_LANDING_UI_BASE;
test.skip(
  !base,
  "Start the local app with synthetic Supabase settings and landing capabilities enabled.",
);
test.use({
  launchOptions: {
    executablePath: process.env.VALIDATION_CHROMIUM_PATH || undefined,
  },
});
const token = "a".repeat(43);
const content = {
  template: "benefits",
  headline: "Spend less time researching",
  description: "An early idea for independent founders.",
  benefits: ["Find relevant signals", "Keep your research focused"],
  cta: "Join the waitlist",
  visual: "✦",
  consent:
    "I agree to share my email with the page creator for updates about this idea. I can request removal at any time.",
  minimumVisitors: 100,
  targetRate: 10,
};
test("public participant: standalone responsive page, explicit consent, signup and retry identity", async ({
  page,
}) => {
  let views = 0,
    submissions = 0;
  await page.route("**/api/public/validation/landing/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/view")) {
      expect(route.request().postDataJSON().requestId).toMatch(
        /^[a-f0-9-]{36}$/,
      );
      views++;
    }
    if (path.endsWith("/submit")) {
      expect(route.request().postDataJSON()).toEqual({
        email: "founder@example.com",
        consent: true,
        website: "",
      });
      submissions++;
    }
    await route.fulfill({
      json: { data: path.endsWith(token) ? content : { accepted: true } },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/validation/landing/${token}`);
  await expect(
    page.getByRole("heading", { name: content.headline }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Product navigation" }),
  ).toHaveCount(0);
  const submit = page.getByRole("button", { name: content.cta });
  await expect(submit).toBeDisabled();
  await page.getByLabel("Email address").fill("founder@example.com");
  await page.getByRole("checkbox").check();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole("status")).toHaveText(
    "Thank you. Your interest has been recorded.",
  );
  expect(submissions).toBe(1);
  expect(views).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("private owner: edit, preview, publish/share, metrics and unpublish", async ({
  page,
}) => {
  const owner = "11000000-0000-0000-0000-000000000001",
    subject = "subject",
    version = "version";
  // Synthetic founder membership; real admission/RLS is covered separately.
  await page.route("**/api/user/capabilities", (route) => route.fulfill({ json: { capabilities: {} } }));
  await page.addInitScript(
    ({ owner }) => {
      const session = {
        access_token: "synthetic-test-token",
        token_type: "bearer",
        refresh_token: "synthetic-refresh",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: owner, email: "owner@example.com" },
      };
      localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
    },
    { owner },
  );
  // Match the Supabase project's storage key for this intentionally local app.
  await page.addInitScript(() => {
    const value = localStorage.getItem("sb-127-auth-token");
    if (value) localStorage.setItem("sb-127.0.0.1-auth-token", value);
  });
  const dashboard: {
    page: null | { id: string; revision: number; content: typeof content };
    publication: null | { id: string; revision: number; publishedAt: string };
    metrics: {
      views: number;
      visitors: number;
      submissions: number;
      convertedVisitors: number;
    };
    submissions: unknown[];
    publicPath?: string;
  } = {
    page: null,
    publication: null,
    metrics: {
      views: 100,
      visitors: 100,
      submissions: 12,
      convertedVisitors: 10,
    },
    submissions: [],
  };
  await page.route("**/api/validation/**", async (route) => {
    const url = new URL(route.request().url());
    let result: unknown;
    if (url.pathname === `/api/validation/subjects/${subject}`)
      result = {
        subject: {
          id: subject,
          label: "Founder research",
          creation_origin: "user_entered",
          created_at: "2026-11-11T12:00:00Z",
          context_snapshot: {},
        },
        links: [],
        hypotheses: [
          {
            id: "hypothesis",
            versions: [
              {
                id: "hypothesis-version",
                hypothesis_id: "hypothesis",
                version_number: 1,
                target_segment: "Founders",
                problem_claim: "Research takes too long",
                expected_observable_behavior: "Join waitlist",
                support_criteria: ["10% signup"],
                contradiction_criteria: ["Below 10%"],
                inconclusive_criteria: ["Too few visitors"],
                created_at: "2026-11-11T12:00:00Z",
              },
            ],
          },
        ],
        experiments: [
          {
            id: "experiment",
            versions: [
              {
                id: version,
                hypothesis_version_id: "hypothesis-version",
                version_number: 1,
                family: "landing_waitlist",
                lifecycle: "running",
                target_audience: ["Founders"],
                collection_method: "Landing page",
              },
            ],
          },
        ],
        observations: [],
        classifications: [],
        interview_plans: [],
        participants: [],
        interview_sessions: [],
        survey_plans: [],
        survey_publications: [],
        survey_submissions: [],
        survey_answers: [],
      };
    else {
      if (url.pathname.endsWith("/save")) {
        const input = route.request().postDataJSON();
        dashboard.page = { id: "page", revision: 1, content: input.content };
      }
      if (url.pathname.endsWith("/publish")) {
        dashboard.publication = {
          id: "publication",
          revision: 1,
          publishedAt: new Date().toISOString(),
        };
        dashboard.publicPath = `/validation/landing/${token}`;
      }
      if (url.pathname.endsWith("/unpublish")) {
        dashboard.publication = null;
        delete dashboard.publicPath;
      }
      result = dashboard;
    }
    await route.fulfill({ json: { data: result } });
  });
  await page.goto(`${base}/validation/${subject}`);
  await expect(
    page.getByRole("heading", { name: "Landing Page", exact: true }),
  ).toBeVisible();
  await page.getByLabel("2. Headline").fill(content.headline);
  await page
    .getByLabel("Description", { exact: true })
    .fill(content.description);
  await page.getByRole("button", { name: "Preview page" }).click();
  await expect(
    page.getByRole("heading", { name: content.headline }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByLabel("Share URL")).toHaveValue(
    `${base}/validation/landing/${token}`,
  );
  await expect(page.getByText("10.0%", { exact: true })).toBeVisible();
  await expect(page.getByText("supporting", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(page.getByText(/^Not published\./)).toBeVisible();
});
