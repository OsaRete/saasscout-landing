import type { ChildProcess } from "node:child_process";

// Pure harness contracts: no database connection or application authority.
export function buildB43Fixture(fixture: string): string {
  const boundary = "create function public.b31_test_promote(";
  if (fixture.split(boundary).length !== 2) throw new Error("fixture_boundary_changed");
  let setup = fixture.split(boundary)[0];
  const replacements = [
    ["generate_series(1,14)", "generate_series(1,120)", 1],
    ["generate_series(1,15)", "generate_series(1,120)", 4],
    ["least(i,14)", "i", 2],
    // B3.1 intentionally lacks review 4. B4.3 needs 4 as a positive and
    // reserves 18 for an explicit missing-review negative control.
    ["where i <> 4;", "where i <> 18;", 1],
  ] as const;
  for (const [before, after, count] of replacements) {
    if (setup.split(before).length - 1 !== count) throw new Error("fixture_contract_changed");
    setup = setup.replaceAll(before, after);
  }
  return setup;
}

export function protocolDiagnostic(status: unknown, code: unknown): string {
  const http = Number.isInteger(status) && typeof status === "number" && status >= 0 && status <= 599
    ? `http:${status}` : "http:unknown";
  return `${http};${typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)
    ? `sqlstate:${code}` : typeof code === "string" && /^PGRST[0-9]{3}$/.test(code)
      ? `postgrest:${code}` : "protocol_error"}`;
}

export function requirePromotionResult(value: unknown): { promotionId: string; problemObservationId: string; duplicate: boolean } {
  const row = value as Record<string, unknown> | null;
  const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
  if (!row || !uuid(row.promotionId) || !uuid(row.problemObservationId) || typeof row.duplicate !== "boolean") {
    throw new Error("promotion_result_malformed");
  }
  return { promotionId: row.promotionId, problemObservationId: row.problemObservationId, duplicate: row.duplicate };
}

// A zero-row mutation cannot prove rejection of corrupted proof or missing facts.
export function singleMutation(statement: string): string {
  return `do $$ declare changed integer; begin ${statement}; get diagnostics changed = row_count;
    if changed <> 1 then raise exception using errcode='ZX002'; end if; end $$;`;
}

export function waitForMarker(child: ChildProcess, marker: string, onText: (text: string) => void, timeoutMs = 10000): Promise<string> {
  return new Promise((resolveMarker, reject) => {
    let accumulated = "";
    const timeout = setTimeout(() => reject(new Error("controlled concurrency marker timeout")), timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      accumulated += text;
      onText(text);
      const line = accumulated.split(/\r?\n/).slice(0, -1).find((entry) => entry.startsWith(marker));
      if (line) { clearTimeout(timeout); resolveMarker(line.slice(marker.length)); }
    });
    child.on("error", () => { clearTimeout(timeout); reject(new Error("controlled concurrency process failed")); });
    child.on("exit", (code) => { clearTimeout(timeout); reject(new Error("controlled concurrency process exited before marker")); void code; });
  });
}

export function waitForExit(child: ChildProcess, timeoutMs = 15000): Promise<number | null> {
  return new Promise((resolveExit, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error("concurrency_exit_timeout")); }, timeoutMs);
    child.once("error", () => { clearTimeout(timeout); reject(new Error("concurrency_process_error")); });
    child.once("close", (code) => { clearTimeout(timeout); resolveExit(code); });
  });
}


export function diagnosticFetch(report: (category: string) => void, request: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    try {
      const response = await request(input, init);
      if (!response.ok) {
        let code: unknown;
        try { code = (await response.clone().json())?.code; } catch { /* suppress raw body */ }
        report(protocolDiagnostic(response.status, code));
      }
      return response;
    } catch { report("transport_exception"); throw new Error("transport_exception"); }
  };
}

export const SOURCE_INVARIANTS: Readonly<Record<string, string>> = {
  "ZC001": "participant no-op response",
  "ZC002": "session notes persisted through status no-op",
  "ZC003": "no-op created restriction",
  "ZC004": "withdrawal response and persisted state",
  "ZC005": "withdrawal contribution restriction",
  "ZC006": "INSERT while withdrawn",
  "ZC007": "restoration persisted",
  "ZC008": "repeated transition idempotency",
  "ZC009": "archive and both contributions",
  "ZC010": "individual consent capture",
  "ZC011": "consent rollback",
  "ZC012": "relevance loss",
  "ZC013": "relevance restoration retains restriction",
  "ZC014": "session cancellation",
  "ZC015": "pause persisted",
  "ZC016": "resume persisted",
  "ZC017": "completion without restriction",
  "ZC018": "experiment cancellation",
  "ZC019": "terminal session unexpectedly mutable",
  "ZC020": "terminal experiment unexpectedly mutable",
  "ZC021": "stale expected state unexpectedly accepted",
  "ZC022": "restriction failure did not abort update",
  "ZC023": "failed capture left source or restrictions changed"
};

export function sourceInvariantDiagnostic(diagnostic: string): string {
  const code = /^sqlstate:([A-Z0-9]{5})$/.exec(diagnostic)?.[1];
  return code && SOURCE_INVARIANTS[code] ? `${diagnostic};invariant:${SOURCE_INVARIANTS[code]}` : code ? diagnostic : "unclassified_sql_error";
}
