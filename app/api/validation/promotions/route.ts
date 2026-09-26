import { body, validationHandler } from "@/lib/validation/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return validationHandler(request, async (service, ownerId) =>
    service.promoteInterviewEvidence(ownerId, await body(request)),
  );
}
