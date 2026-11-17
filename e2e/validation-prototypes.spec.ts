import { test, expect } from "@playwright/test";
import { prototypeTemplate } from "../lib/validation/prototypes";
const base = process.env.VALIDATION_PROTOTYPE_UI_BASE;
test.skip(!base, "Local synthetic prototype app required.");
test.use({
  launchOptions: {
    executablePath: process.env.VALIDATION_CHROMIUM_PATH || undefined,
  },
});
const content = prototypeTemplate("workflow"),
  token = "a".repeat(43);
test("participant mobile: consent, navigation, explicit feedback and safe retry", async ({
  page,
}) => {
  const events: unknown[] = [];
  const submissions: unknown[] = [];
  await page.route("**/api/public/validation/prototype/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/event")) events.push(route.request().postDataJSON());
    if (path.endsWith("/submit")) {
      submissions.push(route.request().postDataJSON());
      if (submissions.length === 1) {
        await route.fulfill({
          status: 503,
          json: { error: { message: "Please retry." } },
        });
        return;
      }
    }
    await route.fulfill({
      json: { data: path.endsWith(token) ? content : { accepted: true } },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/validation/prototype/${token}`);
  await expect(
    page.getByRole("heading", { name: content.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Product navigation" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Explore prototype" }),
  ).toBeDisabled();
  expect(events).toHaveLength(0);
  await expect(page.getByRole("main").locator("..")).toHaveCSS(
    "background-color",
    "rgb(7, 11, 20)",
  );
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Explore prototype" }).click();
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(
    page.getByRole("heading", { name: "Review your task" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Task complete" }),
  ).toBeVisible();
  await page.getByLabel("Could you complete the task?").selectOption("partly");
  await page
    .getByLabel("What worked, what was confusing, and what would you change?")
    .fill("I need clearer details before confirming.");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Please retry.",
  );
  await page.getByRole("button", { name: "Retry same response" }).click();
  await expect(
    page.getByRole("heading", { name: "Thank you for your feedback." }),
  ).toBeVisible();
  expect(submissions).toHaveLength(2);
  expect(submissions[0]).toEqual(submissions[1]);
  expect(events).toHaveLength(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("owner: template, edit, preview, save, publish, results and evidence-preserving removal", async ({
  page,
}) => {
  // Synthetic founder membership; real admission/RLS is covered separately.
  await page.route("**/api/user/capabilities", (route) => route.fulfill({ json: { capabilities: {} } }));
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
  const dashboard: {
    page: null | {
      id: string;
      revision: number;
      removed: boolean;
      content: typeof content;
    };
    publication: null | { id: string; revision: number; publishedAt: string };
    metrics: {
      events: number;
      browsers: number;
      submissions: number;
      screens: unknown[];
      outcomes: unknown[];
    };
    submissions: unknown[];
    publicPath?: string;
  } = {
    page: null,
    publication: null,
    metrics: {
      events: 3,
      browsers: 1,
      submissions: 1,
      screens: [],
      outcomes: [],
    },
    submissions: [],
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
                    family: "interactive_prototype",
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
        removed: false,
        content: body.content,
      };
    }
    if (path.endsWith("/publish")) {
      dashboard.publication = {
        id: "pub",
        revision: 1,
        publishedAt: new Date().toISOString(),
      };
      dashboard.publicPath = `/validation/prototype/${token}`;
    }
    if (path.endsWith("/unpublish")) {
      dashboard.publication = null;
      delete dashboard.publicPath;
    }
    if (path.endsWith("/remove")) {
      dashboard.page!.removed = true;
      dashboard.publication = null;
      delete dashboard.publicPath;
    }
    await route.fulfill({ json: { data: dashboard } });
  });
  await page.goto(`${base}/validation/subject`);
  const panel = page.getByRole("region", { name: "Interactive prototype" });
  await panel.getByLabel("Prototype name").fill("Research workspace");
  await panel.getByRole("button", { name: "Preview", exact: true }).click();
  await panel.getByRole("button", { name: "Mobile", exact: true }).click();
  await panel.getByRole("button", { name: "Get started" }).click();
  await expect(
    panel.getByRole("heading", { name: "Review your task" }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Edit", exact: true }).click();
  await panel.getByRole("button", { name: "Save revision" }).click();
  await expect(panel.getByRole("status")).toContainText("Revision saved");
  await panel.getByRole("button", { name: "Publish private link" }).click();
  await expect(panel.getByLabel("Private participant link")).toHaveValue(
    `${base}/validation/prototype/${token}`,
  );
  await panel.getByRole("button", { name: "Results", exact: true }).click();
  await expect(
    panel.getByText("1 browser identifiers", { exact: false }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(
    panel.getByText("No active participant link", { exact: true }),
  ).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await panel
    .getByRole("button", { name: "Remove prototype", exact: true })
    .click();
  await expect(
    panel.getByText("Removed. Historical feedback remains below.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(dashboard.metrics.submissions).toBe(1);
});
