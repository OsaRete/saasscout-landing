import { test, expect, type Page } from "@playwright/test";
const base = process.env.VALIDATION_HUB_UI_BASE;
const restricted = process.env.VALIDATION_HUB_RESTRICTED_BASE;
const off = process.env.VALIDATION_HUB_OFF_BASE;
test.skip(!base, "Local synthetic Validation Hub app required");
test.use({
  launchOptions: {
    executablePath: process.env.VALIDATION_CHROMIUM_PATH || undefined,
  },
});
async function auth(page: Page) {
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
    localStorage.setItem("sb-placeholder-auth-token", JSON.stringify(session));
  });
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({ json: { id: "owner", email: "owner@example.com" } }),
  );
}
const subject = {
  id: "subject",
  creation_origin: "opportunity",
  label: "Research workflow",
  context_snapshot: {},
  created_at: "2026-11-12T12:00:00Z",
  latest_hypothesis: { problem_claim: "Research takes too long" },
  experiment_count: 1,
  experiment_lifecycles: ["draft"],
  observation_count: 0,
};
function workspace() {
  return {
    subject,
    links: [{ source_type: "opportunity", source_row_id: "owned-opportunity" }],
    hypotheses: [
      {
        id: "h",
        versions: [
          {
            id: "hv",
            hypothesis_id: "h",
            version_number: 1,
            target_segment: "Operators",
            problem_claim: "Research takes too long",
            expected_observable_behavior: "Finish task",
            support_criteria: ["Finish"],
            contradiction_criteria: ["Blocked"],
            inconclusive_criteria: ["Insufficient"],
            created_at: subject.created_at,
          },
        ],
      },
    ],
    experiments: [],
    participants: [],
    interview_plans: [],
    interview_sessions: [],
    survey_plans: [],
    survey_publications: [],
    survey_submissions: [],
    survey_answers: [],
    observations: [],
    classifications: [],
  };
}
async function fits(page: Page) {
  // The existing AppShell animates its sidebar margin after viewport changes.
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
}

test("Hub: loading, empty state, six methods, keyboard guidance and responsive navigation", async ({
  page,
}, testInfo) => {
  await auth(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/validation/subjects", async (route) => {
    await held;
    await route.fulfill({ json: { data: [] } });
  });
  await page.goto(`${base}/validation`);
  await expect(
    page.getByText("Loading your validation studies…"),
  ).toBeVisible();
  release();
  await expect(
    page.getByRole("heading", { name: "Start your first validation study" }),
  ).toBeVisible();
  await expect(page.locator("#methods article")).toHaveCount(6);
  const nav = page
    .getByRole("navigation", { name: "Product navigation" })
    .filter({ visible: true });
  await expect(
    nav.getByRole("link", { name: "Validation Hub" }),
  ).toHaveAttribute("aria-current", "page");
  const goal = page.getByLabel("What do you want to learn?");
  await goal.focus();
  await goal.press("Home");
  await goal.press("ArrowDown");
  await goal.press("Enter");
  await expect(page.getByText("Suggested for your goal")).toBeVisible();
  await page
    .getByRole("button", { name: "Choose Interviews", exact: true })
    .click();
  await expect(page.locator("#studies")).toBeFocused();
  await expect(
    page.getByRole("link", { name: "Start a study with Interviews" }),
  ).toHaveAttribute("href", "/validation/new?method=customer_interview");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("hub-desktop.png"),
    fullPage: true,
  });
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await fits(page);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("hub-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open product navigation" }).click();
  await page
    .getByRole("navigation", { name: "Product navigation" })
    .filter({ visible: true })
    .getByRole("link", { name: "Validation Hub" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Validation Hub", exact: true }),
  ).toBeVisible();
});

test("Hub error recovery and existing study navigation keep factual counts", async ({
  page,
}) => {
  await auth(page);
  let attempts = 0;
  await page.route("**/api/validation/subjects", (route) =>
    route.fulfill(
      ++attempts === 1
        ? { status: 503, json: { error: { message: "Unavailable" } } }
        : { json: { data: [subject] } },
    ),
  );
  await page.route("**/api/validation/subjects/subject", (route) =>
    route.fulfill({ json: { data: workspace() } }),
  );
  await page.goto(`${base}/validation`);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "couldn't load",
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByText("1 experiments · 0 recorded interview observations"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open study and experiments" }).click();
  await expect(
    page.getByRole("heading", { name: "Research workflow" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to source opportunity" }),
  ).toHaveAttribute("href", "/opportunity/owned-opportunity");
  await page.getByRole("link", { name: "Back to Validation Hub" }).click();
  await expect(
    page.getByRole("heading", { name: "Validation Hub", exact: true }),
  ).toBeVisible();
});

test("all six selections reach existing creation contract with correct consent and no AI", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await auth(page);
  const writes: Record<string, unknown>[] = [];
  let ai = 0;
  await page.route("**/api/validation/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("design-assistant")) {
      ai++;
      await route.abort();
      return;
    }
    if (path.endsWith("/experiments")) {
      const body = route.request().postDataJSON();
      writes.push(body);
      await route.fulfill({
        json: {
          data: {
            experiment: { id: "e" },
            version: {
              id: "v",
              hypothesis_version_id: "hv",
              family: body.family,
            },
          },
        },
      });
      return;
    }
    await route.fulfill({ json: { data: workspace() } });
  });
  for (const family of [
    "customer_interview",
    "survey",
    "landing_waitlist",
    "interactive_prototype",
    "external_mvp",
    "commercial_intent",
  ]) {
    await page.goto(`${base}/validation/subject?method=${family}`);
    await page
      .getByRole("button", { name: "Create experiment", exact: true })
      .click();
    const form = page.locator("form");
    await page.setViewportSize({ width: 320, height: 900 });
    await fits(page);
    await expect(form.getByText("Selected", { exact: true })).toBeVisible();
    await form.getByLabel("Target audience").fill("Operators");
    await form
      .getByRole("button", { name: "Create experiment", exact: true })
      .click();
    await expect
      .poll(() => writes.length, { message: `Create ${family}` })
      .toBe(
        [
          "customer_interview",
          "survey",
          "landing_waitlist",
          "interactive_prototype",
          "external_mvp",
          "commercial_intent",
        ].indexOf(family) + 1,
      );
    await expect(
      page.getByText("No experiments yet.", { exact: false }),
    ).toBeVisible();
    expect(writes.at(-1)?.family).toBe(family);
    expect(writes.at(-1)?.consentPrivacyMode).toBe(
      ["landing_waitlist", "external_mvp", "commercial_intent"].includes(family)
        ? "identified_with_explicit_consent"
        : "anonymous_notes",
    );
  }
  expect(ai).toBe(0);
  expect(writes).toHaveLength(6);
});

test("method survives new study creation, including verified opportunity provenance payload", async ({
  page,
}) => {
  await auth(page);
  let body: Record<string, unknown> = {};
  await page.route("**/api/validation/subjects", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ json: { data: { subject: { id: "subject" } } } });
  });
  await page.route("**/api/validation/subjects/subject", (route) =>
    route.fulfill({ json: { data: workspace() } }),
  );
  await page.goto(
    `${base}/validation/new?method=commercial_intent&sourceType=opportunity&sourceId=owned-opportunity&label=Research`,
  );
  await expect(page.getByLabel("Owned source reference")).toHaveValue(
    "owned-opportunity",
  );
  await page
    .getByRole("button", { name: "Create validation", exact: true })
    .click();
  await expect(page).toHaveURL(
    /\/validation\/subject\?method=commercial_intent/,
  );
  expect(body.creationOrigin).toBe("opportunity");
  expect(body.provenance).toMatchObject({
    sourceType: "opportunity",
    sourceRowId: "owned-opportunity",
  });
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Selected method: Commercial Intent" }),
  ).toBeVisible();
});

for (const sourceType of [undefined, "opportunity"]) {
  test(`direct-entry keeps user_entered provenance ${sourceType ? "after leaving an opportunity handoff" : "without Discovery or Scan"}`, async ({
    page,
  }) => {
    await auth(page);
    const submissions: unknown[] = [];
    const unexpected: string[] = [];
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/user/capabilities") return route.fallback();
      if (path === "/api/validation/subjects" && request.method() === "POST") {
        submissions.push(request.postDataJSON());
        await route.fulfill({ json: { data: { subject: { id: "subject" } } } });
      } else if (
        path === "/api/validation/subjects/subject" &&
        request.method() === "GET"
      ) {
        await route.fulfill({
          json: {
            data: {
              ...workspace(),
              subject: { ...subject, creation_origin: "user_entered" },
              links: [],
            },
          },
        });
      } else {
        unexpected.push(path);
        await route.abort();
      }
    });
    const query = new URLSearchParams({
      method: "survey",
      label: "Independent idea",
      description: "Own context",
      sourceId: "unused-opportunity",
    });
    if (sourceType) query.set("sourceType", sourceType);
    await page.goto(`${base}/validation/new?${query}`);
    const ownIdea = page.getByRole("button", { name: /Enter my own idea/ });
    if (sourceType) await ownIdea.click();
    await expect(ownIdea).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Owned source reference")).toHaveCount(0);
    const draftLabel = "Unsaved independent idea";
    const draftContext = "Unsaved context from this session";
    await page.getByLabel("Idea / validation label").fill(draftLabel);
    await page.getByLabel("Context description (optional)").fill(draftContext);
    const rechecked = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/user/capabilities",
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await rechecked;
    await expect(page.getByLabel("Idea / validation label")).toHaveValue(draftLabel);
    await expect(page.getByLabel("Context description (optional)")).toHaveValue(draftContext);
    await page
      .getByRole("button", { name: "Create validation", exact: true })
      .click();
    await expect(page).toHaveURL(/\/validation\/subject\?method=survey$/);
    expect(submissions).toEqual([
      {
        creationOrigin: "user_entered",
        label: draftLabel,
        contextSnapshot: {
          description: draftContext,
          label: draftLabel,
        },
      },
    ]);
    expect(unexpected).toEqual([]);
  });
}

test("restricted capabilities disable method cards and ignore a forged method preference", async ({
  page,
}) => {
  test.skip(!restricted, "Restricted local app required");
  await auth(page);
  await page.route("**/api/validation/subjects", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route("**/api/validation/subjects/subject", (route) =>
    route.fulfill({ json: { data: workspace() } }),
  );
  await page.goto(`${restricted}/validation`);
  await expect(
    page.getByRole("button", { name: "Choose Surveys", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Choose Commercial Intent", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("What do you want to learn?")
    .selectOption("commercial_intent");
  await expect(
    page.getByRole("status").filter({ hasText: "This method is unavailable" }),
  ).toBeVisible();
  await page.goto(`${restricted}/validation/subject?method=commercial_intent`);
  await expect(
    page.getByText("The requested method is unavailable", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create experiment", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Interviews selected", exact: true }),
  ).toBeEnabled();
});

test("default-off layout has no data requests or usable method controls", async ({
  page,
}) => {
  test.skip(!off, "Default-off local app required");
  let requests = 0;
  await page.route("**/api/validation/**", async (route) => {
    requests++;
    await route.abort();
  });
  for (const path of [
    "/validation",
    "/validation/new?method=survey",
    "/validation/subject?method=commercial_intent",
  ]) {
    await page.goto(`${off}${path}`);
    await expect(
      page.getByText("Validation is unavailable in this release.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Choose / })).toHaveCount(0);
  }
  expect(requests).toBe(0);
});

test("missing session returns to login before requesting private study data", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/validation/**", async (route) => {
    requests++;
    await route.abort();
  });
  await page.goto(`${base}/validation`);
  await expect(page).toHaveURL(/\/login/);
  expect(requests).toBe(0);
});

test("existing experiment index opens management and retained results", async ({
  page,
}) => {
  await auth(page);
  const data = {
    ...workspace(),
    experiments: [
      {
        id: "existing-survey",
        versions: [
          {
            id: "sv",
            experiment_id: "existing-survey",
            hypothesis_version_id: "hv",
            family: "survey",
            version_number: 1,
            lifecycle: "completed",
            target_audience: ["Operators"],
            collection_method: "Structured feedback",
            consent_privacy_mode: "anonymous_notes",
            created_at: subject.created_at,
          },
        ],
      },
    ],
  };
  await page.route("**/api/validation/subjects/subject", (route) =>
    route.fulfill({ json: { data } }),
  );
  await page.goto(`${base}/validation/subject`);
  await page
    .getByRole("navigation", { name: "Experiment index" })
    .getByRole("link", { name: /Surveys/ })
    .click();
  await expect(page).toHaveURL(/#experiment-existing-survey$/);
  await expect(
    page.getByText("This experiment has ended.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Responses", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await fits(page);
});
