import { validationOperationAllowed } from "@/lib/validation/server/release-policy";
import { ValidationUnavailable } from "@/components/validation/unavailable";
import PublicCommercialIntent from "./public-commercial-intent";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export const dynamic = "force-dynamic";
export default async function CommercialIntentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!validationOperationAllowed("commercial-intent.resolve", "GET"))
    return <ValidationUnavailable />;
  return <PublicCommercialIntent token={(await params).token} />;
}
