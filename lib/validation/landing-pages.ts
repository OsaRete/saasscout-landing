import { assertObject, text, ValidationServerError } from "./server/contracts";
export const LANDING_TEMPLATES = ["spotlight", "benefits", "minimal"] as const;
export type LandingContent = {
  template: (typeof LANDING_TEMPLATES)[number];
  headline: string;
  description: string;
  benefits: string[];
  cta: string;
  visual: string;
  consent: string;
  minimumVisitors: number;
  targetRate: number;
};
export type LandingPublicContent = Omit<
  LandingContent,
  "minimumVisitors" | "targetRate"
>;
export const LANDING_CONSENT =
  "I agree to share my email with the page creator for updates about this idea. I can request removal at any time.";
export function landingContent(input: unknown): LandingContent {
  assertObject(input);
  if (!LANDING_TEMPLATES.includes(input.template as never))
    throw new ValidationServerError(
      400,
      "invalid_request",
      "Choose a landing page template.",
    );
  if (!Array.isArray(input.benefits) || input.benefits.length > 5)
    throw new ValidationServerError(
      400,
      "invalid_request",
      "Use at most five benefits.",
    );
  if (
    !Number.isInteger(input.minimumVisitors) ||
    Number(input.minimumVisitors) < 20 ||
    Number(input.minimumVisitors) > 100000 ||
    typeof input.targetRate !== "number" ||
    !Number.isFinite(input.targetRate) ||
    input.targetRate < 1 ||
    input.targetRate > 100
  )
    throw new ValidationServerError(
      400,
      "invalid_request",
      "Set a minimum of 20–100,000 visitors and an interest target of 1–100%.",
    );
  // A built-in visual avoids third-party tracking, remote fetches and uploads.
  const visual = input.visual === "" ? "" : text(input.visual, "visual", 4);
  if (visual && !["✦", "◎", "↗"].includes(visual))
    throw new ValidationServerError(
      400,
      "invalid_request",
      "Choose a built-in visual.",
    );
  return {
    template: input.template as LandingContent["template"],
    headline: text(input.headline, "headline", 180),
    description: text(input.description, "description", 1500),
    benefits: input.benefits.map((x) => text(x, "benefit", 200)),
    cta: text(input.cta, "CTA", 60),
    visual,
    consent: LANDING_CONSENT,
    minimumVisitors: Number(input.minimumVisitors),
    targetRate: input.targetRate,
  };
}
export function landingEmail(input: unknown): string {
  const email = text(input, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ValidationServerError(
      400,
      "invalid_request",
      "Enter a valid email address.",
    );
  return email;
}
export function landingInterpretation(
  visitors: number,
  convertedVisitors: number,
  minimumVisitors: number,
  targetRate: number,
) {
  const rate = visitors ? (100 * convertedVisitors) / visitors : null;
  return {
    rate,
    state:
      visitors < minimumVisitors
        ? "inconclusive"
        : rate !== null && rate >= targetRate
          ? "supporting"
          : "contradicting",
  };
}
