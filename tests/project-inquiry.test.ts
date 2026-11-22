import assert from "node:assert/strict";
import test from "node:test";
import { prepareInquiry, inquiryLimits } from "../lib/project-inquiry.ts";
import { isFounderWorkspacePath } from "../lib/auth/workspace-path.ts";

function inquiry(overrides: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    name: " Example Founder ",
    email: " founder@example.test ",
    projectType: "SaaS",
    description: " A tool for preparing invoices. ",
    consent: "yes",
    ...overrides,
  })) form.set(key, value);
  return form;
}

test("contact route participates in the authenticated workspace boundary", () => {
  assert.equal(isFounderWorkspacePath("/contact-a-professional"), true);
  assert.equal(isFounderWorkspacePath("/contact-a-professional-preview"), false);
});

test("validates required fields, limits and allowed options", () => {
  for (const [field, value] of [
    ["name", "   "], ["name", "A\nB"], ["name", "a".repeat(inquiryLimits.name + 1)],
    ["email", "wrong"], ["email", "a@example.test\r\nBcc:other@example.test"],
    ["projectType", "unknown"], ["description", "\n "],
    ["description", "a".repeat(inquiryLimits.description + 1)],
    ["budget", "unknown"], ["timeline", "unknown"],
  ]) {
    assert.equal(prepareInquiry(inquiry({ [field]: value })).error?.field, field);
  }
});

test("requires explicit affirmative consent", () => {
  const form = inquiry();
  form.delete("consent");
  assert.equal(prepareInquiry(form).error?.field, "consent");
  form.set("consent", "false");
  assert.equal(prepareInquiry(form).error?.field, "consent");
});

test("fixes recipient and subject and encodes entered text only in the plain-text body", () => {
  const payload = "An MVP &bcc=other@example.test\n<script>alert(1)</script> 🛠";
  const draft = prepareInquiry(inquiry({
    description: payload, budget: "Under $2,500", timeline: "Flexible",
    recipient: "other@example.test", subject: "overridden",
    validation: "private responses", discovery: "private findings", scan: "private evidence",
  })).draft;
  assert.ok(draft);
  const url = new URL(draft.href);
  assert.equal(url.protocol, "mailto:");
  assert.equal(url.pathname, "cedeomartineze@gmail.com");
  assert.deepEqual([...url.searchParams.keys()], ["subject", "body"]);
  assert.equal(url.searchParams.get("subject"), "SaaSScout project inquiry");
  assert.match(draft.body, /Name: Example Founder\nContact email: founder@example.test/);
  assert.match(draft.body, /Estimated budget \(USD\): Under \$2,500\nDesired timeline: Flexible/);
  assert.ok(draft.body.endsWith(payload));
  assert.equal(url.searchParams.get("body"), draft.body.replaceAll("\n", "\r\n"));
  assert.doesNotMatch(draft.body, /private|overridden/);
});
