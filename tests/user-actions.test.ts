import assert from "node:assert/strict";
import test from "node:test";
import { deleteOpportunityForUser, parseDeleteOpportunityInput, parseDiscoverActionInput, parseSaveIdeaInput, parseUnsaveSavedIdeaInput, recordDiscoverActionForUser, saveIdeaForUser, unsaveSavedIdeaForUser, UserActionError } from "../lib/user-actions.ts";

type Row = Record<string, unknown>;

function client(tables: Record<string, Row[]>, writes: string[] = []) {
  return {
    writes,
    from(table: string) {
      const state = { filters: [] as Array<[string, unknown]>, insertRows: null as Row[] | null };
      const builder = {
        select() { return builder; },
        eq(column: string, value: unknown) { state.filters.push([column, value]); return builder; },
        insert(rows: Row[]) { writes.push(`${table}.insert`); state.insertRows = rows; return builder; },
        upsert(rows: Row[]) { writes.push(`${table}.upsert`); state.insertRows = rows; return builder; },
        delete() { writes.push(`${table}.delete`); return builder; },
        limit() { return builder; },
        maybeSingle() { const rows = (tables[table] || []).filter((row) => state.filters.every(([k, v]) => row[k] === v)); if (writes.at(-1) === `${table}.delete`) tables[table] = (tables[table] || []).filter((row) => !state.filters.every(([k, v]) => row[k] === v)); return Promise.resolve({ data: rows[0] || null, error: null }); },
        single() {
          if (state.insertRows) {
            const row = { id: `${table}-${(tables[table] || []).length + 1}`, ...state.insertRows[0] };
            tables[table] ||= [];
            tables[table].push(row);
            return Promise.resolve({ data: row, error: null });
          }
          return builder.maybeSingle();
        },
      };
      return builder;
    },
  };
}

test("Saved Ideas derives user_id server-side and ignores browser ownership", async () => {
  const writes: string[] = [];
  const db = client({ opportunities: [{ id: "opp-1", user_id: "server-user" }], saved_ideas: [] }, writes);
  assert.deepEqual(parseSaveIdeaInput({ opportunityId: "opp-1", user_id: "attacker" }), { opportunityId: "opp-1" });
  const result = await saveIdeaForUser({ client: db, userId: "server-user", opportunityId: "opp-1" });
  assert.equal(result.saved, true);
  assert.equal(db.writes[0], "saved_ideas.upsert");
});

test("Saved Ideas rejects ownership mismatches and does not write", async () => {
  const writes: string[] = [];
  const db = client({ opportunities: [{ id: "opp-1", user_id: "other-user" }], saved_ideas: [] }, writes);
  await assert.rejects(() => saveIdeaForUser({ client: db, userId: "server-user", opportunityId: "opp-1" }), (error) => error instanceof UserActionError && error.status === 404);
  assert.deepEqual(writes, []);
});

test("Saved Ideas duplicate requests are deterministic", async () => {
  const db = client({ opportunities: [{ id: "opp-1", user_id: "server-user" }], saved_ideas: [{ id: "saved-1", user_id: "server-user", opportunity_id: "opp-1" }] });
  const result = await saveIdeaForUser({ client: db, userId: "server-user", opportunityId: "opp-1" });
  assert.equal(result.duplicate, true);
  assert.equal(result.id, "saved-1");
  assert.deepEqual(db.writes, []);
});

test("Discover Actions derives user_id server-side and validates relationships", async () => {
  const db = client({ opportunity_discoveries: [{ id: "disc-1", user_id: "server-user", status: "completed" }], discovered_problems: [{ id: "prob-1", discovery_id: "disc-1", user_id: "server-user" }], discovery_actions: [] });
  assert.deepEqual(parseDiscoverActionInput({ discoveryId: "disc-1", problemId: "prob-1", actionType: "prepared_deep_scan", user_id: "attacker" }), { discoveryId: "disc-1", problemId: "prob-1", actionType: "prepared_deep_scan" });
  const result = await recordDiscoverActionForUser({ client: db, userId: "server-user", discoveryId: "disc-1", problemId: "prob-1", actionType: "prepared_deep_scan" });
  assert.equal(result.duplicate, false);
  assert.equal(db.writes[0], "discovery_actions.upsert");
});

test("Discover Actions rejects invalid discovery/problem relationships", async () => {
  const db = client({ opportunity_discoveries: [{ id: "disc-1", user_id: "server-user", status: "completed" }], discovered_problems: [{ id: "prob-1", discovery_id: "other-disc", user_id: "server-user" }], discovery_actions: [] });
  await assert.rejects(() => recordDiscoverActionForUser({ client: db, userId: "server-user", discoveryId: "disc-1", problemId: "prob-1", actionType: "prepared_deep_scan" }), (error) => error instanceof UserActionError && error.status === 404);
  assert.deepEqual(db.writes, []);
});

test("Discover Actions duplicate requests are deterministic", async () => {
  const db = client({ opportunity_discoveries: [{ id: "disc-1", user_id: "server-user", status: "completed" }], discovered_problems: [{ id: "prob-1", discovery_id: "disc-1", user_id: "server-user" }], discovery_actions: [{ id: "action-1", user_id: "server-user", discovery_id: "disc-1", problem_id: "prob-1", action_type: "prepared_deep_scan" }] });
  const result = await recordDiscoverActionForUser({ client: db, userId: "server-user", discoveryId: "disc-1", problemId: "prob-1", actionType: "prepared_deep_scan" });
  assert.equal(result.duplicate, true);
  assert.equal(result.id, "action-1");
  assert.deepEqual(db.writes, []);
});


test("Saved Ideas unsave derives user_id server-side and is deterministic", async () => {
  const db = client({ saved_ideas: [{ id: "saved-1", user_id: "server-user", opportunity_id: "opp-1" }] });
  assert.deepEqual(parseUnsaveSavedIdeaInput({ savedIdeaId: "saved-1", user_id: "attacker" }), { savedIdeaId: "saved-1", opportunityId: null });
  const result = await unsaveSavedIdeaForUser({ client: db, userId: "server-user", savedIdeaId: "saved-1" });
  assert.equal(result.removed, true);
  const repeated = await unsaveSavedIdeaForUser({ client: db, userId: "server-user", savedIdeaId: "saved-1" });
  assert.equal(repeated.removed, false);
});

test("Saved Ideas unsave cannot remove another user's row", async () => {
  const db = client({ saved_ideas: [{ id: "saved-1", user_id: "other-user", opportunity_id: "opp-1" }] });
  const result = await unsaveSavedIdeaForUser({ client: db, userId: "server-user", savedIdeaId: "saved-1" });
  assert.equal(result.removed, false);
});

test("Opportunity deletion derives user_id server-side and cleans only owned saved ideas", async () => {
  const db = client({ opportunities: [{ id: "opp-1", user_id: "server-user" }], saved_ideas: [{ id: "saved-1", user_id: "server-user", opportunity_id: "opp-1" }, { id: "saved-2", user_id: "other-user", opportunity_id: "opp-1" }] });
  assert.deepEqual(parseDeleteOpportunityInput({ opportunityId: "opp-1", user_id: "attacker" }), { opportunityId: "opp-1" });
  const result = await deleteOpportunityForUser({ client: db, userId: "server-user", opportunityId: "opp-1" });
  assert.equal(result.deleted, true);
  assert.deepEqual(db.writes, ["saved_ideas.delete", "opportunities.delete"]);
});

test("Opportunity deletion returns generic not found for cross-user resources", async () => {
  const db = client({ opportunities: [{ id: "opp-1", user_id: "other-user" }], saved_ideas: [] });
  await assert.rejects(() => deleteOpportunityForUser({ client: db, userId: "server-user", opportunityId: "opp-1" }), (error) => error instanceof UserActionError && error.status === 404);
});

test("browser code no longer inserts saved_ideas or discovery_actions directly", async () => {
  const { readFile } = await import("node:fs/promises");
  const files = ["app/results/page.tsx", "app/opportunity/[id]/page.tsx", "app/discover/page.tsx"];
  const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));
  for (const content of contents) {
    assert.equal(/from\(["']saved_ideas["']\)\s*\.insert/.test(content), false);
    assert.equal(/from\(["']saved_ideas["']\)\s*\.delete/.test(content), false);
    assert.equal(/from\(["']opportunities["']\)\s*\.delete/.test(content), false);
    assert.equal(/from\(["']discovery_actions["']\)\s*\.insert/.test(content), false);
  }
});
