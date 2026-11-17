import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { createSupabaseAdminClient } from "../supabase/server-admin.ts";

type Workflow = "scan" | "discovery" | "weekly" | "collect-sources" | "x-search";
type Provider = "openrouter" | "serpapi" | "x";
type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
type Scope = { userId: string; workflow: Workflow; requestId: string; counters: Partial<Record<Provider, number>>; client?: RpcClient };
const scopes = new AsyncLocalStorage<Scope>();

export class ProviderBudgetError extends Error {
  readonly status = 503;
  constructor() { super("Provider spending admission is unavailable or exhausted."); this.name = "ProviderBudgetError"; }
}

export function spendingRequestId(request: Request): string {
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new ProviderBudgetError();
  }
  return key.toLowerCase();
}

// Identity comes only from authenticated entry points / successful database workflow claims.
export function withProviderBudget<T>(identity: { userId: string; workflow: Workflow; requestId: string }, operation: () => T, client?: RpcClient): T {
  return scopes.run({ ...identity, counters: {}, client }, operation);
}

export function bindWeeklySpendingAttempt(run: Record<string, unknown>): void {
  const scope = scopes.getStore();
  if (!scope || scope.workflow !== "weekly" || run.user_id !== scope.userId || typeof run.id !== "string" ||
      !Number.isSafeInteger(run.spending_execution_attempts) || Number(run.spending_execution_attempts) < 1) throw new ProviderBudgetError();
  scope.requestId = `${run.id}:${run.spending_execution_attempts}`;
}

function providerFor(url: URL): Provider {
  if (url.origin === "https://openrouter.ai" && url.pathname === "/api/v1/chat/completions") return "openrouter";
  if (url.origin === "https://serpapi.com" && url.pathname === "/search.json") return "serpapi";
  if (url.origin === "https://api.x.com" && url.pathname === "/2/tweets/search/recent") return "x";
  throw new ProviderBudgetError();
}

function validateEnvelope(provider: Provider, url: URL, init?: RequestInit): void {
  if (provider === "openrouter") {
    if (typeof init?.body !== "string" || Buffer.byteLength(init.body) > 131_072) throw new ProviderBudgetError();
    const body = JSON.parse(init.body);
    if (body.model !== "openai/gpt-4.1-mini" || !Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 3200 || body.stream) throw new ProviderBudgetError();
  } else {
    const count = Number(url.searchParams.get(provider === "x" ? "max_results" : "num"));
    if (!Number.isInteger(count) || count < 1 || count > (provider === "x" ? 20 : 10) || url.href.length > 8192) throw new ProviderBudgetError();
  }
}

// This is the actual transport boundary: SDK retries and application corrections must
// each acquire a fresh durable slot. No scope means no dispatch, including direct callers.
export async function budgetedProviderFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  return dispatchProviderFetch(input, init, fetch);
}

export async function dispatchProviderFetch(input: string | URL | Request, init: RequestInit | undefined, transport: typeof fetch): Promise<Response> {
  const scope = scopes.getStore();
  if (!scope || !scope.userId || !scope.requestId || (scope.workflow === "weekly" && scope.requestId === "unclaimed") || input instanceof Request) throw new ProviderBudgetError();
  const url = new URL(String(input));
  const provider = providerFor(url);
  validateEnvelope(provider, url, init);
  const ordinal = (scope.counters[provider] ?? 0) + 1;
  scope.counters[provider] = ordinal;
  const preReserved = scope.workflow === "scan";
  if (preReserved && (provider !== "openrouter" || ordinal > 2)) throw new ProviderBudgetError();
  const args = { p_user_id: scope.userId, p_workflow: scope.workflow,
    p_request_id: preReserved ? scope.requestId : `${scope.requestId}:${ordinal}`, p_provider: provider };
  const client = scope.client ?? createSupabaseAdminClient();
  const rpc = async (name: string, extra: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, { ...args, ...extra });
    if (error || data !== true) throw new ProviderBudgetError();
  };
  if (!preReserved) await rpc("application_reserve_provider", { p_slots: 1 });
  await rpc("application_dispatch_provider", { p_slot: preReserved ? ordinal : 1 });
  // Claim is already committed. Transport/body failures intentionally retain both
  // usage and the active slot, since remote processing may still be running.
  const response = await transport(input, { ...init, redirect: "error", signal: init?.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000) });
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2_097_152) { await reader.cancel(); throw new ProviderBudgetError(); }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  // HTTP errors can leave upstream execution uncertain. Retain their active slot
  // as well as their charge. Only a complete successful response settles concurrency.
  if (response.ok) await rpc("application_finish_provider", { p_slot: preReserved ? ordinal : 1 });
  return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
}
