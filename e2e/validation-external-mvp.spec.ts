import { test, expect } from "@playwright/test";
import { externalMvpTemplate } from "../lib/validation/external-mvp";
import type { ExternalMvpDashboard } from "../lib/validation/server/external-mvp";
const base = process.env.VALIDATION_EXTERNAL_MVP_UI_BASE;
test.skip(!base, "Local synthetic MVP app required");
test.use({
  launchOptions: {
    executablePath: process.env.VALIDATION_CHROMIUM_PATH || undefined,
  },
});
const token = "a".repeat(43),
  content = { ...externalMvpTemplate(), url: "https://example.com/try" };
test("participant mobile: external link, consent, optional contact and unchanged retry", async ({
  page,
}) => {
  const submissions: unknown[] = [];
  let externalRequests = 0;
  await page.route("https://example.com/**", async (route) => {
    externalRequests++;
    await route.abort();
  });
  await page.route(
    "**/api/public/validation/external-mvp/**",
    async (route) => {
      const isSubmit = route.request().url().endsWith("/submit");
      if (isSubmit) {
        submissions.push(route.request().postDataJSON());
        if (submissions.length === 1) {
          await route.fulfill({
            status: 503,
            json: { error: { message: "Retry please." } },
          });
          return;
        }
      }
      await route.fulfill({
        json: { data: isSubmit ? { accepted: true } : content },
      });
    },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/validation/external-mvp/${token}`);
  await expect(
    page.getByRole("heading", { name: content.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Product navigation" }),
  ).toHaveCount(0);
  const link = page.getByRole("link", { name: /Open external MVP/ });
  await expect(link).toHaveAttribute("href", content.url);
  await expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
  expect(externalRequests).toBe(0);
  expect(submissions).toHaveLength(0);
  await page
    .getByLabel("Did you complete the task? (self-reported)")
    .selectOption("not_tried");
  for (const q of content.questions)
    await page
      .getByLabel(q, { exact: true })
      .fill("I did not try it; the instructions need context.");
  await expect(
    page.getByRole("button", { name: "Send feedback" }),
  ).toBeDisabled();
  await page.getByLabel(content.consent, { exact: true }).check();
  await page
    .getByLabel("Email for follow-up (optional)")
    .fill("participant@example.com");
  await expect(
    page.getByRole("button", { name: "Send feedback" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /I agree to share my email/ })
    .check();
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Retry please.",
  );
  await page.getByRole("button", { name: "Retry same response" }).click();
  await expect(
    page.getByRole("heading", { name: "Thank you for your feedback." }),
  ).toBeVisible();
  expect(submissions).toHaveLength(2);
  expect(submissions[0]).toEqual(submissions[1]);
  expect(externalRequests).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("owner: template, edit, preview, save, publish, results and evidence-preserving removal", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const session = {
      access_token: "synthetic-test-token",
      token_type: "bearer",
      refresh_token: "synthetic-refresh",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "owner", email: "owner@example.com" },
    };
    localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
    localStorage.setItem("sb-127.0.0.1-auth-token", JSON.stringify(session));
  });
  const dashboard: ExternalMvpDashboard = {
    page: null,
    publication: null,
    metrics: {
      submissions: 1,
      contacts: 1,
      outcomes: [{ outcome: "no", count: 1 }],
    },
    submissions: [
      {
        id: "response",
        revision: 1,
        outcome: "no",
        answers: [
          {
            question: "What blocked you?",
            answer: "Could not find the action",
          },
        ],
        email: "participant@example.com",
        submitted_at: "2026-11-12T12:00:00Z",
      },
    ],
  };
  await page.route("**/api/validation/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/validation/subjects/subject") {
      await route.fulfill({
        json: {
          data: {
            subject: {
              id: "subject",
              creation_origin: "user_entered",
              label: "Prototype idea",
              context_snapshot: {},
              created_at: new Date().toISOString(),
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
                    target_segment: "Operators",
                    problem_claim: "Research takes too long",
                    expected_observable_behavior: "Complete a research task",
                    support_criteria: ["Finish task"],
                    contradiction_criteria: ["Cannot finish"],
                    inconclusive_criteria: ["Too little feedback"],
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
                    id: "version",
                    experiment_id: "experiment",
                    family: "external_mvp",
                    version_number: 1,
                    lifecycle: "running",
                    target_audience: ["operators"],
                    collection_method: "Private concept test",
                    created_at: new Date().toISOString(),
                  },
                ],
              },
            ],
            participants: [],
            participant_count: 0,
            interview_plans: [],
            interview_sessions: [],
            survey_plans: [],
            survey_publications: [],
            survey_submissions: [],
            survey_answers: [],
            observations: [],
            classifications: [],
          },
        },
      });
      return;
    }
    if (path.endsWith("/save")) {
      const body = route.request().postDataJSON();
      dashboard.page = {
        id: "p",
        revision: 1,
        content: body.content,
      };
    }
    if (path.endsWith("/publish")) {
      dashboard.publication = {
        id: "pub",
        revision: 1,
        publishedAt: new Date().toISOString(),
      };
      dashboard.publicPath = `/validation/external-mvp/${token}`;
    }
    if (path.endsWith("/unpublish")) {
      dashboard.publication = null;
      delete dashboard.publicPath;
    }
    if (path.endsWith("/remove")) {
      dashboard.submissions[0].email = null;
      dashboard.metrics.contacts = 0;
    }
    await route.fulfill({ json: { data: dashboard } });
  });
  await page.goto(`${base}/validation/subject`);
  const panel = page.getByRole("region", { name: "External MVP Testing" });
  await panel.getByLabel("Test title").fill("Research MVP");
  await panel.getByLabel("External MVP URL").fill("https://example.com/try");
  await panel.getByRole("button", { name: "Preview", exact: true }).click();
  await panel.getByRole("button", { name: "Mobile", exact: true }).click();
  await expect(
    panel.getByRole("heading", { name: "Research MVP" }),
  ).toBeVisible();
  await expect(panel.getByRole("link", { name: /Open external/ })).toHaveCount(
    0,
  );
  await panel.getByRole("button", { name: "Edit", exact: true }).click();
  await panel.getByRole("button", { name: "Save revision" }).click();
  await expect(panel.getByRole("status")).toContainText("Revision saved");
  await panel.getByRole("button", { name: "Publish private link" }).click();
  await expect(panel.getByLabel("Private participant link")).toHaveValue(
    `${base}/validation/external-mvp/${token}`,
  );
  await panel.getByRole("button", { name: "Results", exact: true }).click();
  await expect(
    panel.getByText("1 feedback submissions", { exact: false }),
  ).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await panel
    .getByRole("button", { name: "Remove contact", exact: true })
    .click();
  await expect(
    panel.getByText("Unverified contact:", { exact: false }),
  ).toHaveCount(0);
  await panel.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(
    panel.getByText("No active participant link", { exact: true }),
  ).toBeVisible();
  expect(dashboard.metrics.submissions).toBe(1);
});
