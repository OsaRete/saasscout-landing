import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceRefresh } from "../components/validation/workspace-refresh.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("authoritative post-command reload cannot reuse or accept a pre-command read", async () => {
  const beforeMutation = deferred<{ lifecycle: string }>();
  const afterMutation = deferred<{ lifecycle: string }>();
  const requests = [beforeMutation.promise, afterMutation.promise];
  const accepted: string[] = [];
  const refresh = createWorkspaceRefresh({
    request: () => requests.shift()!,
    accept: (workspace) => accepted.push(workspace.lifecycle),
    reject: assert.fail,
  });
  refresh.activate();

  const passive = refresh.passive();
  const authoritative = refresh.authoritative();
  assert.equal(requests.length, 0, "the command reload must start a new read");

  afterMutation.resolve({ lifecycle: "running" });
  await authoritative;
  beforeMutation.resolve({ lifecycle: "ready" });
  await passive;

  assert.deepEqual(accepted, ["running"]);
});

test("equivalent passive reads remain single-flight", async () => {
  const pending = deferred<{ lifecycle: string }>();
  let requestCount = 0;
  const accepted: string[] = [];
  const refresh = createWorkspaceRefresh({
    request: () => {
      requestCount += 1;
      return pending.promise;
    },
    accept: (workspace) => accepted.push(workspace.lifecycle),
    reject: assert.fail,
  });
  refresh.activate();

  const first = refresh.passive();
  const second = refresh.passive();
  assert.equal(first, second);
  assert.equal(requestCount, 1);
  pending.resolve({ lifecycle: "ready" });
  await Promise.all([first, second]);
  assert.deepEqual(accepted, ["ready"]);
});
