import { validationOperationAllowed } from "@/lib/validation/server/release-policy";
import { ValidationUnavailable } from "@/components/validation/unavailable";
import PublicExternalMvp from "./public-external-mvp";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export const dynamic = "force-dynamic";
export default async function ExternalMvpPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!validationOperationAllowed("external-mvp.resolve", "GET"))
    return <ValidationUnavailable />;
  return <PublicExternalMvp token={(await params).token} />;
}
