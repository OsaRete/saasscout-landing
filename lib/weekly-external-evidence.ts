import "server-only";

import { createHash } from "node:crypto";
import type { WeeklyMonitoringTopic } from "./weekly-monitoring-context.ts";
import type { WeeklyPeriod } from "./weekly-intelligence.ts";

export const WEEKLY_EXTERNAL_SOURCE_FINGERPRINT_VERSION = "weekly-external-source@1";
export const WEEKLY_CONTENT_FINGERPRINT_VERSION = "weekly-content-fingerprint@1";
export const WEEKLY_EXTERNAL_LIMITS = Object.freeze({ maxTopics: 5, queriesPerTopic: 3, maxQueries: 12, resultsPerQuery: 4, maxResults: 40, queryTimeoutMs: 8_000, totalTimeoutMs: 25_000 });
export type WeeklyExternalFreshness = "new" | "resurfaced" | "changed" | "unchanged" | "publication_unknown";
export type WeeklyExternalOriginClass = "raw_external";

export type WeeklyExternalProviderResult = Readonly<{ provider: string; sourceType: string; url: string; title?: string | null; snippet?: string | null; publishedAt?: string | null; rank?: number | null }>;
export type WeeklyExternalEvidence = Readonly<{
  evidenceId: string; runId: string; monitoringTopicFingerprint: string; sourceProvider: string; sourceType: string;
  url: string; canonicalUrl: string; title: string | null; snippet: string | null; publishedAt: string | null;
  collectedAt: string; firstSeenAt: string; lastSeenAt: string; firstSeenPeriodStart: string;
  contentFingerprint: string; freshness: WeeklyExternalFreshness; originClass: WeeklyExternalOriginClass; sourceRank: number | null;
}>;
export type WeeklyExternalHistory = Readonly<{ canonicalUrl: string; contentFingerprint: string; firstSeenAt: string; firstSeenPeriodStart: string; lastSeenAt: string; periodStart: string; monitoringTopicFingerprint: string }>;
export type WeeklyExternalQuery = Readonly<{ monitoringTopicFingerprint: string; query: string }>;
export type WeeklyExternalProvider = Readonly<{
  name: string; configured: () => boolean;
  search: (input: { query: string; limit: number; signal: AbortSignal }) => Promise<WeeklyExternalProviderResult[]>;
}>;

const compact = (value: unknown, max: number) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, max);
const normalizedContent = (value: unknown) => compact(value, 4_000).toLowerCase();
const hash = (version: string, value: string) => createHash("sha256").update(`${version}\n${value}`, "utf8").digest("hex");

export function buildWeeklyExternalQueries(topics: readonly WeeklyMonitoringTopic[]): WeeklyExternalQuery[] {
  const output: WeeklyExternalQuery[] = [];
  for (const topic of topics.slice(0, WEEKLY_EXTERNAL_LIMITS.maxTopics)) {
    const terms = [...new Set([topic.market, topic.niche, topic.title].map((value) => compact(value, 80)).filter(Boolean))].join(" ");
    if (!terms) continue;
    for (const suffix of ["problems pain friction", "manual workflow complaints", "cost errors buying software"]) {
      output.push({ monitoringTopicFingerprint: topic.fingerprint, query: `${terms} ${suffix}` });
      if (output.length === WEEKLY_EXTERNAL_LIMITS.maxQueries) return output;
    }
  }
  return output;
}

export function canonicalizeWeeklyExternalUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    url.searchParams.sort();
    return url.toString();
  } catch { return null; }
}

function validPublishedAt(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

export function normalizeWeeklyExternalResult(input: { result: WeeklyExternalProviderResult; runId: string; topicFingerprint: string; period: WeeklyPeriod; collectedAt: string }): WeeklyExternalEvidence | null {
  const canonicalUrl = canonicalizeWeeklyExternalUrl(input.result.url);
  if (!canonicalUrl) return null;
  const provider = compact(input.result.provider, 80).toLowerCase();
  const sourceType = compact(input.result.sourceType, 80).toLowerCase();
  if (!provider || !sourceType) return null;
  const title = compact(input.result.title, 300) || null;
  const snippet = compact(input.result.snippet, 1_000) || null;
  const contentFingerprint = `wec_${hash(WEEKLY_CONTENT_FINGERPRINT_VERSION, `${normalizedContent(title)}\n${normalizedContent(snippet)}`)}`;
  const sourceIdentity = hash(WEEKLY_EXTERNAL_SOURCE_FINGERPRINT_VERSION, `${provider}\n${sourceType}\n${canonicalUrl}`);
  return Object.freeze({ evidenceId: `weekly_external_${sourceIdentity}`, runId: input.runId, monitoringTopicFingerprint: input.topicFingerprint, sourceProvider: provider, sourceType, url: input.result.url.trim(), canonicalUrl, title, snippet, publishedAt: validPublishedAt(input.result.publishedAt), collectedAt: input.collectedAt, firstSeenAt: input.collectedAt, lastSeenAt: input.collectedAt, firstSeenPeriodStart: input.period.period_start, contentFingerprint, freshness: "new", originClass: "raw_external", sourceRank: Number.isFinite(input.result.rank) ? Number(input.result.rank) : null });
}

export function deduplicateWeeklyExternalEvidence(observations: readonly WeeklyExternalEvidence[]) {
  const selected = new Map<string, WeeklyExternalEvidence>();
  for (const item of observations) {
    const current = selected.get(item.canonicalUrl);
    if (!current || `${item.sourceProvider}|${item.evidenceId}` < `${current.sourceProvider}|${current.evidenceId}`) selected.set(item.canonicalUrl, item);
  }
  return [...selected.values()].sort((a, b) => a.canonicalUrl.localeCompare(b.canonicalUrl));
}

export function classifyWeeklyExternalEvidence(observations: readonly WeeklyExternalEvidence[], history: readonly WeeklyExternalHistory[], period: WeeklyPeriod) {
  return observations.map((item) => {
    const matches = history.filter((old) => old.canonicalUrl === item.canonicalUrl && old.monitoringTopicFingerprint === item.monitoringTopicFingerprint).sort((a, b) => b.periodStart.localeCompare(a.periodStart));
    const latest = matches[0];
    let freshness: WeeklyExternalFreshness;
    if (!latest && !item.publishedAt) freshness = "publication_unknown";
    else if (!latest) freshness = "new";
    else if (latest.contentFingerprint !== item.contentFingerprint) freshness = "changed";
    else {
      const immediatelyPrevious = new Date(period.period_start).getTime() - new Date(latest.periodStart).getTime() <= 7 * 24 * 60 * 60 * 1000;
      freshness = immediatelyPrevious ? "unchanged" : "resurfaced";
    }
    return Object.freeze({ ...item, freshness, firstSeenAt: latest?.firstSeenAt || item.firstSeenAt, firstSeenPeriodStart: latest?.firstSeenPeriodStart || item.firstSeenPeriodStart });
  });
}

export type WeeklyExternalCollection = Readonly<{ status: "healthy" | "degraded" | "unavailable" | "not_configured" | "no_results"; observations: WeeklyExternalEvidence[]; metrics: Readonly<{ providerAttemptCount: number; providerSuccessCount: number; providerFailureCount: number; providerNotConfiguredCount: number; rawExternalResultCount: number; normalizedExternalResultCount: number; deduplicatedExternalCount: number; sourceDegraded: boolean }> }>;

export async function collectWeeklyExternalEvidence(input: { topics: readonly WeeklyMonitoringTopic[]; providers: readonly WeeklyExternalProvider[]; runId: string; period: WeeklyPeriod; collectedAt: string }): Promise<WeeklyExternalCollection> {
  const queries = buildWeeklyExternalQueries(input.topics);
  if (!queries.length) return { status: "no_results", observations: [], metrics: { providerAttemptCount: 0, providerSuccessCount: 0, providerFailureCount: 0, providerNotConfiguredCount: 0, rawExternalResultCount: 0, normalizedExternalResultCount: 0, deduplicatedExternalCount: 0, sourceDegraded: false } };
  const configured = input.providers.filter((provider) => provider.configured());
  const missing = input.providers.length - configured.length;
  if (!configured.length) return { status: "not_configured", observations: [], metrics: { providerAttemptCount: 0, providerSuccessCount: 0, providerFailureCount: 0, providerNotConfiguredCount: missing, rawExternalResultCount: 0, normalizedExternalResultCount: 0, deduplicatedExternalCount: 0, sourceDegraded: true } };
  let successes = 0, failures = 0;
  const raw: Array<{ result: WeeklyExternalProviderResult; topicFingerprint: string }> = [];
  const jobs = queries.flatMap((query) => configured.map(async (provider) => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), WEEKLY_EXTERNAL_LIMITS.queryTimeoutMs);
    try { const results = await provider.search({ query: query.query, limit: WEEKLY_EXTERNAL_LIMITS.resultsPerQuery, signal: controller.signal }); successes += 1; for (const result of results.slice(0, WEEKLY_EXTERNAL_LIMITS.resultsPerQuery)) raw.push({ result, topicFingerprint: query.monitoringTopicFingerprint }); }
    catch { failures += 1; } finally { clearTimeout(timer); }
  }));
  let totalTimer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([Promise.allSettled(jobs), new Promise<void>((resolve) => { totalTimer = setTimeout(resolve, WEEKLY_EXTERNAL_LIMITS.totalTimeoutMs); })]);
  if (totalTimer) clearTimeout(totalTimer);
  const limited = raw.slice(0, WEEKLY_EXTERNAL_LIMITS.maxResults);
  const normalized = limited.flatMap((entry) => { const item = normalizeWeeklyExternalResult({ ...entry, runId: input.runId, period: input.period, collectedAt: input.collectedAt }); return item ? [item] : []; });
  const observations = deduplicateWeeklyExternalEvidence(normalized);
  const sourceDegraded = failures > 0 || missing > 0;
  const status = successes === 0 ? "unavailable" : observations.length === 0 ? "no_results" : sourceDegraded ? "degraded" : "healthy";
  return { status, observations, metrics: { providerAttemptCount: configured.length * queries.length, providerSuccessCount: successes, providerFailureCount: failures, providerNotConfiguredCount: missing, rawExternalResultCount: limited.length, normalizedExternalResultCount: normalized.length, deduplicatedExternalCount: observations.length, sourceDegraded } };
}

export function createWeeklySerpApiProvider(fetcher: typeof fetch = fetch): WeeklyExternalProvider {
  return { name: "serpapi", configured: () => Boolean(process.env.SERPAPI_API_KEY), async search({ query, limit, signal }) {
    const params = new URLSearchParams({ engine: "google", q: query, num: String(limit), api_key: process.env.SERPAPI_API_KEY || "" });
    const response = await fetcher(`https://serpapi.com/search.json?${params}`, { cache: "no-store", signal });
    const body = await response.json() as { organic_results?: Array<{ title?: string; link?: string; snippet?: string; date?: string; position?: number }>; error?: string };
    if (!response.ok) throw new Error("SerpApi request failed");
    return (body.organic_results || []).map((item) => ({ provider: "serpapi", sourceType: "google_search", url: item.link || "", title: item.title, snippet: item.snippet, publishedAt: item.date, rank: item.position }));
  } };
}
