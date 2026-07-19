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
  readonly code: "scan_acceptance_request_invalid" | "scan_acceptance_persistence_failed";

  constructor(
    code: "scan_acceptance_request_invalid" | "scan_acceptance_persistence_failed",
    message = "The Scan acceptance request is invalid.",
  ) {
    super(message);
    this.name = "ScanAcceptanceError";
    this.code = code;
  }
}

type AuthenticatedScanUser = Readonly<{ id: string }>;
type InsertableSupabaseClient = Pick<SupabaseClient, "from">;

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
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing.");
  return { url, key };
}

export function createScanAcceptanceClient(request: Request): SupabaseClient {
  const token = request.headers.get("authorization")?.slice("Bearer ".length).trim() || "";
  const { url, key } = readSupabaseConfig();
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
}

export async function acceptScanRequest(input: ScanAcceptanceInput, user: AuthenticatedScanUser, client: InsertableSupabaseClient): Promise<ScanAcceptanceContract> {
  const { data, error } = await client
    .from("scan")
    .insert([
      {
        user_id: user.id,
        market: input.market ?? null,
        audience: input.audience ?? null,
        region: input.region ?? null,
        evidence: input.evidence ?? null,
        file_url: null,
        status: "pending",
      },
    ])
    .select("id,status")
    .single();

  if (error || !data || typeof data.id !== "string" || data.status !== "pending") {
    throw new ScanAcceptanceError("scan_acceptance_persistence_failed", "The Scan could not be accepted.");
  }

  return Object.freeze({ version: SCAN_ACCEPTANCE_VERSION, scanId: data.id, status: "pending" });
}

export async function runScanAcceptance(request: Request, dependencies: { client?: InsertableSupabaseClient } = {}): Promise<Response> {
  try {
    const user = await requireUser(request);
    const input = validateScanAcceptanceRequest(await request.json());
    const acceptance = await acceptScanRequest(input, { id: user.id }, dependencies.client ?? createScanAcceptanceClient(request));
    return Response.json({ success: true, acceptance });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ success: false, error: "Unauthorized" }, { status: error.status });
    if (error instanceof ScanAcceptanceError) {
      return Response.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.code === "scan_acceptance_persistence_failed" ? 500 : 400 });
    }
    return Response.json({ success: false, error: { code: "scan_acceptance_failed", message: "The Scan could not be accepted." } }, { status: 500 });
  }
}
