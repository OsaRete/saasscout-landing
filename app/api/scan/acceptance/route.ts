import { runScanAcceptance } from "@/lib/scan/acceptance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return runScanAcceptance(request);
}
