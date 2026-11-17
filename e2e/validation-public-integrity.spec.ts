import { test, expect } from "@playwright/test";
import { externalMvpTemplate } from "../lib/validation/external-mvp";
import { commercialIntentTemplate } from "../lib/validation/commercial-intent";
const base = process.env.VALIDATION_PUBLIC_INTEGRITY_UI_BASE;
test.skip(!base, "Local synthetic participant app required");
test.use({
  launchOptions: {
    executablePath: process.env.VALIDATION_CHROMIUM_PATH || undefined,
  },
});
const token = "z".repeat(43);
for (const method of ["survey", "external-mvp", "commercial-intent"]) {
  const content =
    method === "survey"
      ? {
          title: "Retry research",
          purpose: "Synthetic research",
          questions: [
            {
              questionRef: "question_1",
              prompt: "What happened?",
              type: "short_text",
              required: true,
            },
          ],
        }
      : method === "external-mvp"
        ? {
            ...externalMvpTemplate(),
            url: "https://example.com/try",
            questions: ["What happened?"],
          }
        : { ...commercialIntentTemplate(), questions: ["What happened?"] };
  test(`${method}: correction, lost committed response, repeated clicks, malformed response and rate-limit retry`, async ({
    page,
  }) => {
    await page.clock.install();
    const requests: string[] = [];
    const records = new Map<string, string>();
    await page.route("**/api/public/**", async (route) => {
      const request = route.request(),
        url = request.url();
      const submit =
        method === "survey"
          ? url.endsWith("/responses")
          : url.endsWith("/submit");
      if (!submit) {
        await route.fulfill({
          json: { data: url.endsWith("/view") ? { accepted: true } : content },
        });
        return;
      }
      const body = request.postData()!;
      requests.push(body);
      if (requests.length === 1) {
        await route.fulfill({
          status: 400,
          json: {
            error: { code: "invalid_request", submissionRejected: true },
          },
        });
        return;
      }
      const identity =
        JSON.parse(body).requestId || JSON.parse(body).idempotencyKey;
      if (records.has(identity)) expect(records.get(identity)).toBe(body);
      records.set(identity, body);
      if (requests.length === 2) {
        await route.abort("failed");
        return;
      }
      if (requests.length === 3) {
        await route.fulfill({ status: 200, body: "malformed" });
        return;
      }
      if (requests.length === 4) {
        await route.fulfill({
          status: 429,
          headers: { "Retry-After": "60" },
          json: { error: { code: "invalid_request" } },
        });
        return;
      }
      await route.fulfill({
        json: { data: { accepted: true, duplicate: true } },
      });
    });
    await page.goto(`${base}/validation/${method}/${token}`);
    const field = page.getByRole("textbox").first();
    await field.fill("Original response");
    if (method !== "survey") {
      await page
        .getByRole("combobox")
        .selectOption(method === "external-mvp" ? "no" : "not_now");
      await page.getByRole("checkbox").check();
    }
    const button = page.locator("form button").last();
    await button.click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Please correct your response and submit again.",
    );
    await expect(field).toBeEnabled();
    await field.fill("Corrected response");
    // Two synchronous submits before React can render a disabled button.
    await page.locator("form").evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "could not be confirmed",
    );
    expect(requests).toHaveLength(2);
    await expect(field).toBeDisabled();
    await button.click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "could not be confirmed",
    );
    await button.click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Please wait",
    );
    await expect(button).toBeDisabled();
    await page.clock.fastForward(60_100);
    await expect(button).toBeEnabled();
    await button.click();
    await expect(
      page.getByRole("heading", { name: /Thank you/ }),
    ).toBeVisible();
    expect(records.size).toBe(1);
    expect(requests).toHaveLength(5);
    expect(new Set(requests.slice(1)).size).toBe(1);
    expect(requests[0]).not.toBe(requests[1]);
    const storage = await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }));
    expect(JSON.stringify(storage)).not.toContain("Corrected response");
  });
  for (const [status, code] of [
    [404, "not_found"],
    [409, "idempotency_conflict"],
  ] as const) {
    test(`${method}: ${code} retains held state and stops resubmission`, async ({
      page,
    }) => {
      await page.route("**/api/public/**", (route) => {
        const submit = /\/(responses|submit)$/.test(route.request().url());
        return route.fulfill(
          submit
            ? { status, json: { error: { code } } }
            : {
                json: {
                  data: route.request().url().endsWith("/view")
                    ? { accepted: true }
                    : content,
                },
              },
        );
      });
      await page.goto(`${base}/validation/${method}/${token}`);
      const field = page.getByRole("textbox").first();
      await field.fill("Research response");
      if (method !== "survey") {
        await page
          .getByRole("combobox")
          .selectOption(method === "external-mvp" ? "no" : "not_now");
        await page.getByRole("checkbox").check();
      }
      const button = page.locator("form button").last();
      await button.click();
      await expect(button).toBeDisabled();
      await expect(field).toBeDisabled();
      await expect(page.getByRole("main").getByRole("alert")).toContainText(
        code === "not_found" ? "closed or unavailable" : "conflicts",
      );
      await expect(
        page.getByRole("heading", { name: /Thank you/ }),
      ).toHaveCount(0);
    });
  }
}
