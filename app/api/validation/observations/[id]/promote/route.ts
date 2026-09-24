import { validationHandler } from "@/lib/validation/server/http";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return validationHandler(request, (service, ownerId) => service.promoteInterviewObservation(ownerId, id));
}
