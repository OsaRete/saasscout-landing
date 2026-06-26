import { generateKnowledgeId } from "../../knowledge/fingerprint";
import { averageTrendScore } from "./scoring";
import type { TrendEvidence, TrendTimeWindow } from "./types";

/** Normalizes dates for the Trend Engine so future orchestrators can compare market movement consistently. */
export function normalizeTrendDate(value: string | Date | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

/** Returns a deterministic window size in days for temporal grouping of trend evidence. */
export function normalizeTimeWindowDays(days: number | null | undefined) {
  const value = Number(days ?? 30);
  if (!Number.isFinite(value) || value <= 0) return 30;
  return Math.max(1, Math.round(value));
}

/** Groups trend evidence into chronological windows that reveal repeated emergence and acceleration over time. */
export function createTrendTimeWindows(evidence: TrendEvidence[], timeWindowDays = 30): TrendTimeWindow[] {
  if (evidence.length === 0) return [];
  const windowMs = normalizeTimeWindowDays(timeWindowDays) * 24 * 60 * 60 * 1000;
  const sorted = [...evidence].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  const firstTime = Date.parse(sorted[0].capturedAt);
  const grouped = new Map<number, TrendEvidence[]>();

  for (const item of sorted) {
    const index = Math.floor((Date.parse(item.capturedAt) - firstTime) / windowMs);
    grouped.set(index, [...(grouped.get(index) || []), item]);
  }

  return Array.from(grouped.entries()).map(([index, group]) => {
    const startsAt = new Date(firstTime + index * windowMs).toISOString();
    const endsAt = new Date(firstTime + (index + 1) * windowMs - 1).toISOString();
    return {
      id: generateKnowledgeId("ttw", startsAt, endsAt, String(index)),
      label: `Window ${index + 1}`,
      startsAt,
      endsAt,
      evidenceCount: group.length,
      averagePainIntensity: averageTrendScore(group.map((item) => item.painIntensity)),
      averageFrequencySignal: averageTrendScore(group.map((item) => item.frequencySignal)),
      averageEvidenceConfidence: averageTrendScore(group.map((item) => item.confidenceScore)),
      averageSourceQuality: averageTrendScore(group.map((item) => item.sourceQualityScore)),
    };
  });
}

/** Calculates the change between first and last time windows for explainable trend direction. */
export function calculateWindowChange(windows: TrendTimeWindow[], selector: (window: TrendTimeWindow) => number) {
  if (windows.length < 2) return 0;
  return Number((selector(windows[windows.length - 1]) - selector(windows[0])).toFixed(1));
}
