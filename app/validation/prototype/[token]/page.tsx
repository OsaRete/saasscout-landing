import { validationOperationAllowed } from "@/lib/validation/server/release-policy";
import { ValidationUnavailable } from "@/components/validation/unavailable";
import PublicPrototype from "./public-prototype";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export const dynamic = "force-dynamic";
export default async function PrototypePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!validationOperationAllowed("prototype.resolve", "GET"))
    return <ValidationUnavailable />;
  return <PublicPrototype token={(await params).token} />;
}
