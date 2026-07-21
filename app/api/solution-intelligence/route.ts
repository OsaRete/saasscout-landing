export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEGACY_SCAN_ROUTE_STATUS = 410;
const LEGACY_SCAN_ROUTE_ERROR = "legacy_scan_generation_route_gone";
const LEGACY_SCAN_ROUTE_MESSAGE =
  "This legacy Scan generation endpoint has been retired. Use /api/scan/workflow for authenticated Scan generation.";

function legacyRouteId(url: string) {
  return new URL(url).pathname.replace(/^\/api\//, "");
}

function requestCorrelationId(request: Request) {
  return request.headers.get("x-request-id") ?? request.headers.get("x-correlation-id") ?? undefined;
}

export async function POST(request: Request) {
  const route = legacyRouteId(request.url);
  console.warn("Legacy Scan generation route rejected", {
    event: "legacy_scan_generation_route_rejected",
    route,
    action: "rejected",
    status: LEGACY_SCAN_ROUTE_STATUS,
    authenticated: request.headers.get("authorization")?.startsWith("Bearer ") === true,
    requestCorrelationId: requestCorrelationId(request),
  });

  return Response.json(
    {
      success: false,
      error: LEGACY_SCAN_ROUTE_ERROR,
      message: LEGACY_SCAN_ROUTE_MESSAGE,
      replacement: "/api/scan/workflow",
    },
    { status: LEGACY_SCAN_ROUTE_STATUS },
  );
}
