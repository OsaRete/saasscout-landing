import { validationOperationAllowed } from "@/lib/validation/server/release-policy";
import { ValidationUnavailable } from "@/components/validation/unavailable";
import PublicLanding from "./public-landing";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export const dynamic = "force-dynamic";
export default async function LandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!validationOperationAllowed("landing.resolve", "GET"))
    return <ValidationUnavailable />;
  return <PublicLanding token={(await params).token} />;
}
