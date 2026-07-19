import { runScanServerOrchestration } from "@/lib/scan/server-orchestration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return runScanServerOrchestration(request);
}
