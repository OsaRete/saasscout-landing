import { expect, test, type Page } from "@playwright/test";

const base = process.env.CONTACT_INQUIRY_UI_BASE;
const path = "/contact-a-professional";
test.skip(!base, "Local synthetic workspace required");
test.use({ launchOptions: { executablePath: process.env.CONTACT_INQUIRY_CHROMIUM_PATH || undefined } });

async function mockMembership(page: Page, status: number) {
  await page.addInitScript(() => {
    localStorage.setItem("sb-placeholder-auth-token", JSON.stringify({
      access_token: "synthetic-contact-token", token_type: "bearer", refresh_token: "synthetic-refresh",
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "fixture-owner", email: "private-account@example.test" },
    }));
  });
  await page.route("**/api/user/capabilities", (route) => {
    expect(route.request().headers().authorization).toBe("Bearer synthetic-contact-token");
    return route.fulfill({ status, json: {} });
  });
}

test("signed-out visitors are redirected", async ({ page }) => {
  await page.goto(`${base}${path}`);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Project inquiry" })).toHaveCount(0);
});

for (const [status, message] of [[403, "Verify your email to continue"], [503, "Access could not be verified"]] as const) {
  test(`membership result ${status} keeps the form closed with safe guidance`, async ({ page }) => {
    await mockMembership(page, status);
    await page.goto(`${base}${path}`);
    await expect(page.getByText(message, { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Project inquiry" })).toHaveCount(0);
  });
}

test("admitted workspace prepares a single draft and keeps entered details local", async ({ page }) => {
  await mockMembership(page, 200);
  await page.goto(`${base}${path}`);
  const nav = page.getByRole("navigation", { name: "Product navigation" });
  const contactLink = nav.getByRole("link", { name: "Contact a Professional" });
  await expect(contactLink).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link").nth(7)).toHaveText("Validation Hub");
  await expect(nav.getByRole("link").nth(8)).toHaveText("Contact a Professional");
  await expect(page.getByLabel("Contact email")).toHaveValue("");

  const requests: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method()) || request.url().includes("invoice")) requests.push(request.url());
  });
  await page.getByLabel("Name", { exact: true }).fill("Example Founder");
  await page.getByLabel("Contact email").fill("reply@example.test");
  await page.getByLabel("Project type").selectOption("SaaS");
  await page.getByLabel("Project description").fill("  ");
  const consent = page.getByRole("checkbox");
  await expect(consent).not.toBeChecked();
  const prepare = page.getByRole("button", { name: "Prepare email draft" });
  await prepare.click();
  await expect(consent).toBeFocused();
  await consent.check();
  await prepare.click();
  await expect(page.locator("#inquiry-error")).toContainText("Describe your project");
  await page.getByLabel("Project description").fill("An invoice tool for contractors.");
  await prepare.press("Enter");
  const draft = page.getByRole("link", { name: "Open email app" });
  await expect(draft).toBeFocused();
  await expect(draft).toHaveCount(1);
  await expect(prepare).toHaveCount(0);
  await expect(draft).toHaveAttribute("href", /^mailto:cedeomartineze@gmail\.com\?subject=/);
  expect(decodeURIComponent((await draft.getAttribute("href"))!)).not.toContain("private-account");
  await expect(page.getByRole("status")).toContainText("Review and send");
  await page.getByText("Email app didn’t open or load the full message?").click();
  await expect(page.getByLabel("Prepared email message")).toHaveValue(/An invoice tool/);
  await consent.uncheck();
  await expect(draft).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("mobile navigation opens the inquiry and the layout fits the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockMembership(page, 200);
  await page.goto(`${base}/validation`);
  await page.getByRole("button", { name: "Open product navigation" }).click();
  await page.getByRole("link", { name: "Contact a Professional" }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByRole("heading", { name: "Project inquiry" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
