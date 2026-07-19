import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { SCAN_ACCEPTANCE_VERSION, ScanAcceptanceError, acceptScanRequest, validateScanAcceptanceRequest } from "../lib/scan/acceptance.ts";

function mockClient(result: { data: unknown; error: unknown } = { data: { id: "scan-123", status: "pending" }, error: null }) {
  const calls: unknown[] = [];
  return {
    calls,
    from(table: string) {
      calls.push({ table });
      return {
        insert(rows: unknown[]) {
          calls.push({ rows });
          return {
            select(columns: string) {
              calls.push({ columns });
              return { single: async () => result };
            },
          };
        },
      };
    },
  };
}

test("valid Scan requests are accepted with a stable server contract", async () => {
  const input = validateScanAcceptanceRequest({ market: " Agencies ", audience: " Owners ", region: " US ", evidence: " Manual reporting " });
  const client = mockClient();
  const acceptance = await acceptScanRequest(input, { id: "user-1" }, client as never);

  assert.deepEqual(input, { market: "Agencies", audience: "Owners", region: "US", evidence: "Manual reporting" });
  assert.deepEqual(acceptance, { version: SCAN_ACCEPTANCE_VERSION, scanId: "scan-123", status: "pending" });
  assert.deepEqual(Object.keys(acceptance), ["version", "scanId", "status"]);
  assert.deepEqual(client.calls.at(1), { rows: [{ user_id: "user-1", market: "Agencies", audience: "Owners", region: "US", evidence: "Manual reporting", file_url: null, status: "pending" }] });
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
  const client = mockClient({ data: null, error: { message: "denied" } });
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
  assert.match(route, /runScanAcceptance/);
});
