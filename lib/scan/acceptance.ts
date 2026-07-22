import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AuthError, requireUser } from "../../app/api/_utils/auth.ts";

export const SCAN_ACCEPTANCE_VERSION = "scan-acceptance@1" as const;

export type ScanAcceptanceInput = Readonly<{
  market?: string;
  audience?: string;
  region?: string;
  evidence?: string;
}>;

export type ScanAcceptanceContract = Readonly<{
  version: typeof SCAN_ACCEPTANCE_VERSION;
  scanId: string;
  status: "pending";
}>;

export class ScanAcceptanceError extends Error {
  readonly code: "scan_acceptance_request_invalid" | "scan_acceptance_persistence_failed" | "scan_acceptance_limit_exceeded";

  constructor(
    code: "scan_acceptance_request_invalid" | "scan_acceptance_persistence_failed" | "scan_acceptance_limit_exceeded",
    message = "The Scan acceptance request is invalid.",
  ) {
    super(message);
    this.name = "ScanAcceptanceError";
    this.code = code;
  }
}

type AuthenticatedScanUser = Readonly<{ id: string }>;
type ScanAcceptanceRpcResult = Readonly<{ scan_id?: unknown; status?: unknown; accepted?: unknown; rejection_code?: unknown }>;
type InsertableSupabaseClient = Pick<SupabaseClient, "from" | "rpc">;

const ALLOWED_ACCEPTANCE_FIELDS = new Set(["market", "audience", "region", "evidence"]);
const FORBIDDEN_CLIENT_FIELDS = new Set([
  "id",
  "scanId",
  "user_id",
  "userId",
  "status",
  "file_url",
  "created_at",
  "updated_at",
  "acceptedAt",
  "acceptanceVersion",
]);

function objectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype);
}

function validateKeys(record: Record<string, unknown>) {
  for (const key of Object.keys(record)) {
    if (!ALLOWED_ACCEPTANCE_FIELDS.has(key) || FORBIDDEN_CLIENT_FIELDS.has(key)) {
      throw new ScanAcceptanceError("scan_acceptance_request_invalid");
    }
  }
}

function stringField(record: Record<string, unknown>, key: keyof ScanAcceptanceInput, max: number): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new ScanAcceptanceError("scan_acceptance_request_invalid");
  const trimmed = value.trim().slice(0, max);
  return trimmed || undefined;
}

export function validateScanAcceptanceRequest(body: unknown): ScanAcceptanceInput {
  if (!objectRecord(body)) throw new ScanAcceptanceError("scan_acceptance_request_invalid");
  validateKeys(body);

  const input = Object.freeze({
    market: stringField(body, "market", 120),
    audience: stringField(body, "audience", 120),
    region: stringField(body, "region", 80),
    evidence: stringField(body, "evidence", 12_000),
  });

  if (!input.market && !input.evidence) {
    throw new ScanAcceptanceError("scan_acceptance_request_invalid");
  }

  return input;
}

function readSupabaseConfig(env: NodeJS.ProcessEnv = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
  return { url, key };
}

export function createScanAcceptanceClient(): SupabaseClient {
  const { url, key } = readSupabaseConfig();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function scanAcceptanceHttpStatusForCode(code: ScanAcceptanceError["code"]): number {
  if (code === "scan_acceptance_limit_exceeded") return 402;
  if (code === "scan_acceptance_persistence_failed") return 500;
  return 400;
}

function normalizeRpcResult(data: unknown): ScanAcceptanceRpcResult | null {
  if (Array.isArray(data)) return objectRecord(data[0]) ? data[0] : null;
  return objectRecord(data) ? data : null;
}

export async function acceptScanRequest(input: ScanAcceptanceInput, user: AuthenticatedScanUser, client: InsertableSupabaseClient): Promise<ScanAcceptanceContract> {
  const { data, error } = await client.rpc("accept_scan_request", {
    p_user_id: user.id,
    p_market: input.market ?? null,
    p_audience: input.audience ?? null,
    p_region: input.region ?? null,
    p_evidence: input.evidence ?? null,
  });

  const result = normalizeRpcResult(data);

  if (error || !result) {
    throw new ScanAcceptanceError("scan_acceptance_persistence_failed", "The Scan could not be accepted.");
  }

  if (result.accepted === false && result.rejection_code === "scan_limit_exceeded") {
    throw new ScanAcceptanceError("scan_acceptance_limit_exceeded", "You have reached your plan Scan limit.");
  }

  if (result.accepted !== true || typeof result.scan_id !== "string" || result.status !== "pending") {
    throw new ScanAcceptanceError("scan_acceptance_persistence_failed", "The Scan could not be accepted.");
  }

  return Object.freeze({ version: SCAN_ACCEPTANCE_VERSION, scanId: result.scan_id, status: "pending" });
}

export async function runScanAcceptance(request: Request, dependencies: { client?: InsertableSupabaseClient } = {}): Promise<Response> {
  try {
    const user = await requireUser(request);
    const input = validateScanAcceptanceRequest(await request.json());
    const acceptance = await acceptScanRequest(input, { id: user.id }, dependencies.client ?? createScanAcceptanceClient());
    return Response.json({ success: true, acceptance });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ success: false, error: "Unauthorized" }, { status: error.status });
    if (error instanceof ScanAcceptanceError) {
      const status = scanAcceptanceHttpStatusForCode(error.code);
      return Response.json({ success: false, error: { code: error.code, message: error.message } }, { status });
    }
    return Response.json({ success: false, error: { code: "scan_acceptance_failed", message: "The Scan could not be accepted." } }, { status: 500 });
  }
}
