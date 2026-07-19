import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { SCAN_ACCEPTANCE_VERSION, ScanAcceptanceError, acceptScanRequest, validateScanAcceptanceRequest } from "../lib/scan/acceptance.ts";

function mockRpcClient(result: { data: unknown; error: unknown } = { data: { scan_id: "scan-123", status: "pending", accepted: true, rejection_code: null }, error: null }) {
  const calls: unknown[] = [];
  return {
    calls,
    async rpc(functionName: string, args: Record<string, unknown>) {
      calls.push({ functionName, args });
      return result;
    },
  };
}

test("valid Scan requests are accepted with a stable server contract", async () => {
  const input = validateScanAcceptanceRequest({ market: " Agencies ", audience: " Owners ", region: " US ", evidence: " Manual reporting " });
  const client = mockRpcClient();
  const acceptance = await acceptScanRequest(input, { id: "user-1" }, client as never);

  assert.deepEqual(input, { market: "Agencies", audience: "Owners", region: "US", evidence: "Manual reporting" });
  assert.deepEqual(acceptance, { version: SCAN_ACCEPTANCE_VERSION, scanId: "scan-123", status: "pending" });
  assert.deepEqual(Object.keys(acceptance), ["version", "scanId", "status"]);
  assert.deepEqual(client.calls, [{ functionName: "accept_scan_request", args: { p_user_id: "user-1", p_market: "Agencies", p_audience: "Owners", p_region: "US", p_evidence: "Manual reporting" } }]);
});

test("users under their Scan limit are accepted and reserve one server execution", async () => {
  const client = mockRpcClient({ data: [{ scan_id: "scan-under-limit", status: "pending", accepted: true, rejection_code: null }], error: null });
  const acceptance = await acceptScanRequest({ market: "Agencies" }, { id: "user-1" }, client as never);

  assert.equal(acceptance.scanId, "scan-under-limit");
  assert.equal((client.calls[0] as { functionName: string }).functionName, "accept_scan_request");
});

test("users over their Scan limit are rejected by the server acceptance boundary", async () => {
  const client = mockRpcClient({ data: { scan_id: null, status: null, accepted: false, rejection_code: "scan_limit_exceeded" }, error: null });

  await assert.rejects(() => acceptScanRequest({ market: "Agencies" }, { id: "user-1" }, client as never), (error) => error instanceof ScanAcceptanceError && error.code === "scan_acceptance_limit_exceeded");
  assert.equal(client.calls.length, 1);
});

test("rejected Scan requests do not receive an acceptance or consume client-side usage", async () => {
  const client = mockRpcClient({ data: { scan_id: null, status: null, accepted: false, rejection_code: "scan_limit_exceeded" }, error: null });

  await assert.rejects(() => acceptScanRequest({ evidence: "Repeated pain" }, { id: "user-1" }, client as never));
  assert.deepEqual(client.calls, [{ functionName: "accept_scan_request", args: { p_user_id: "user-1", p_market: null, p_audience: null, p_region: null, p_evidence: "Repeated pain" } }]);
});

test("duplicate Scan requests return the existing acceptance instead of creating another Scan", async () => {
  const client = mockRpcClient({ data: { scan_id: "existing-scan", status: "pending", accepted: true, rejection_code: null }, error: null });

  const first = await acceptScanRequest({ market: "Agencies", evidence: "Manual reporting" }, { id: "user-1" }, client as never);
  const second = await acceptScanRequest({ market: "Agencies", evidence: "Manual reporting" }, { id: "user-1" }, client as never);

  assert.deepEqual(first, second);
  assert.equal(first.scanId, "existing-scan");
});

test("repeated requests cannot increment usage twice because usage is owned by one RPC", () => {
  const migration = readFileSync("supabase/migrations/20260719000000_accept_scan_request_limits_idempotency.sql", "utf8");

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.accept_scan_request/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /v_existing_scan_id IS NOT NULL/);
  assert.match(migration, /UPDATE public\.user_profiles\s+SET scans_used = scans_used \+ 1/s);
});

test("invalid Scan acceptance requests are rejected before persistence", () => {
  for (const body of [null, [], {}, { audience: "owners" }, { market: 1 }, { market: "x", status: "processing" }, { evidence: "x", user_id: "attacker" }, { scanId: "client" }]) {
    assert.throws(() => validateScanAcceptanceRequest(body), ScanAcceptanceError);
  }
});

test("browser cannot bypass acceptance by owning server fields", () => {
  assert.throws(() => validateScanAcceptanceRequest({ market: "x", id: "client-id" }), ScanAcceptanceError);
  assert.throws(() => validateScanAcceptanceRequest({ evidence: "x", file_url: "client-path" }), ScanAcceptanceError);
  assert.throws(() => validateScanAcceptanceRequest({ evidence: "x", acceptedAt: "now" }), ScanAcceptanceError);
});

test("acceptance persistence failures are controlled", async () => {
  const client = mockRpcClient({ data: null, error: { message: "denied" } });
  await assert.rejects(() => acceptScanRequest({ market: "Agencies" }, { id: "user-1" }, client as never), (error) => error instanceof ScanAcceptanceError && error.code === "scan_acceptance_persistence_failed");
});

test("current Scan UI remains compatible with legacy processing after server acceptance", () => {
  const page = readFileSync("app/scan/page.tsx", "utf8");
  const route = readFileSync("app/api/scan/acceptance/route.ts", "utf8");

  assert.match(page, /fetch\("\/api\/scan\/acceptance"/);
  assert.match(page, /version: "scan-acceptance@1"; scanId: string; status: "pending"/);
  assert.match(page, /acceptedScanId = scanAcceptance\.scanId/);
  assert.match(page, /transitionLegacyScanStatus\(\{\s*scanId: scanAcceptance\.scanId/s);
  assert.doesNotMatch(page, /\.from\("scan"\)\s*\.insert/s);
  assert.doesNotMatch(page, /scans_used:\s*newScansUsed/);
  assert.match(route, /runScanAcceptance/);
});
