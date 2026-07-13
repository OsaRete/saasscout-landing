import type { DiscoverySnapshotAdapterInput } from "./discovery-adapter.ts";
import type { SnapshotEvidenceRelationship, SnapshotSupportTarget } from "./types.ts";
import type { DiscoveredProblem } from "../discovery-response-normalization";

export type DiscoverOpportunitiesSnapshotSource = Readonly<{
  source_type?: string | null;
  category?: string | null;
  title?: string | null;
  url?: string | null;
  snippet?: string | null;
  signal_score?: number | null;
}>;

export type DiscoverOpportunitiesSnapshotInput = Readonly<{
  discoveryId: string;
  createdAt: string;
  completedAt: string;
  userId: string;
  plan?: string | null;
  sourcesLimit: number;
  externalSources: readonly DiscoverOpportunitiesSnapshotSource[];
  moatSources: readonly DiscoverOpportunitiesSnapshotSource[];
  problems: readonly DiscoveredProblem[];
  summary?: string | null;
}>;

function stableSnapshotId(discoveryId: string): string {
  // The first production Snapshot is one immutable artifact for a persisted discovery row.
  // Deriving the ID only from opportunity_discoveries.id makes route/serverless retries replay
  // the same Snapshot identity instead of minting a new one at the RPC boundary.
  return `snapshot:discover-opportunities:${discoveryId}`;
}

function requireNonEmpty(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Discover Opportunities Snapshot adapter requires ${fieldName}.`);
  return normalized;
}

function splitList(value: string | null | undefined): readonly string[] {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function score(value: number | null | undefined, scale: 10 | 100 = 10) {
  const numeric = Number(value || 0);
  const normalized = scale === 100 ? numeric / 100 : numeric / 10;
  return { value: Number(Math.min(1, Math.max(0, normalized)).toFixed(4)) };
}

function providerName(source: DiscoverOpportunitiesSnapshotSource): string {
  return String(source.source_type || source.category || "unknown_source").trim() || "unknown_source";
}

function sourceId(prefix: "external" | "moat", index: number): string {
  return `discover-opportunities:${prefix}:${index + 1}`;
}

function buildSourceEvidence({
  sources,
  prefix,
  relationship,
  supports,
  createdAt,
}: {
  sources: readonly DiscoverOpportunitiesSnapshotSource[];
  prefix: "external" | "moat";
  relationship: SnapshotEvidenceRelationship;
  supports: readonly SnapshotSupportTarget[];
  createdAt: string;
}) {
  return sources
    .map((source, index) => {
      const claim = String(source.snippet || source.title || "").trim();
      if (!claim) return null;
      const id = sourceId(prefix, index);
      return {
        evidenceId: `evidence:${id}`,
        kind: prefix === "external" ? "external_source" as const : "supporting_observation" as const,
        relationship,
        claim,
        supports,
        confidence: score(source.signal_score, 10),
        sourceReference: {
          sourceId: id,
          sourceType: providerName(source),
          sourceName: source.title?.trim() || providerName(source),
          sourceUrl: source.url?.trim() || null,
          capturedAt: createdAt,
        },
        provenanceIds: [id],
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export function buildDiscoverOpportunitiesSnapshotInput(
  input: DiscoverOpportunitiesSnapshotInput,
): DiscoverySnapshotAdapterInput {
  const discoveryId = requireNonEmpty(input.discoveryId, "discoveryId");
  const createdAt = requireNonEmpty(input.createdAt, "createdAt");
  const completedAt = requireNonEmpty(input.completedAt, "completedAt");
  const [problem] = [...input.problems].sort((left, right) => right.opportunity_score - left.opportunity_score);

  if (!problem) {
    throw new Error("Discover Opportunities Snapshot adapter requires at least one normalized problem.");
  }

  const problemEvidenceId = "evidence:discovered-problem:top-opportunity";
  const opportunityEvidenceId = "evidence:discovered-problem:source-summary";
  const externalEvidence = buildSourceEvidence({
    sources: input.externalSources.slice(0, 8),
    prefix: "external",
    relationship: "supports_problem",
    supports: [{ section: "problem_intelligence", field: "pain_description" }],
    createdAt,
  });
  const moatEvidence = buildSourceEvidence({
    sources: input.moatSources.slice(0, 8),
    prefix: "moat",
    relationship: "supports_opportunity",
    supports: [{ section: "opportunity_intelligence", field: "validation_indicators" }],
    createdAt,
  });
  const evidenceIds = [problemEvidenceId, opportunityEvidenceId, ...externalEvidence.map((item) => item.evidenceId), ...moatEvidence.map((item) => item.evidenceId)].sort((left, right) => left.localeCompare(right));

  return {
    metadata: {
      snapshotId: stableSnapshotId(discoveryId),
      discoveryId,
      createdAt,
    },
    discoveryContext: {
      searchTopic: problem.problem_cluster || problem.problem_title,
      searchIntent: "discover monetizable market problems from external and Data Moat signals",
      discoveryMode: "opportunity_discovery",
      requestedLanguage: "en",
      sourceProviders: [
        ...new Set([...input.externalSources.map(providerName), ...input.moatSources.map(providerName), "openrouter_analysis"]),
      ],
      requestedAt: createdAt,
      completedAt,
      configuration: {
        requestedMaxResults: input.sourcesLimit,
        selectedSourceProviders: ["external_sources", "data_moat", "openrouter_analysis"],
        discoveryMode: "opportunity_discovery",
        language: "en",
        includeFounderContext: false,
      },
    },
    problemIntelligence: {
      title: problem.problem_title,
      summary: problem.problem_summary,
      painDescription: problem.source_evidence,
      affectedMarket: problem.problem_cluster,
      affectedAudience: splitList(problem.affected_niches).join(" | ") || null,
      painSeverity: score(problem.pain_score),
      frequency: score(problem.frequency_score),
      urgency: score(problem.urgency_score),
      existingWorkarounds: [],
      relatedNiches: splitList(problem.affected_niches),
      evidenceIds,
    },
    opportunityIntelligence: {
      summary: input.summary || problem.suggested_solutions || problem.problem_summary,
      opportunityScore: score(problem.opportunity_score, 100),
      marketSizeSignals: splitList(problem.affected_niches),
      competitiveSignals: [],
      buildSimplicity: score(problem.build_difficulty === "Easy" ? 8 : problem.build_difficulty === "Hard" ? 4 : 6),
      willingnessToPay: score(problem.buying_signal_score),
      revenuePotential: score(problem.revenue_score),
      riskIndicators: problem.build_difficulty === "Hard" ? ["High implementation complexity"] : [],
      validationIndicators: [problem.source_evidence, ...splitList(problem.suggested_solutions)].filter(Boolean).sort((left, right) => left.localeCompare(right)),
      evidenceIds,
    },
    evidence: [
      {
        evidenceId: problemEvidenceId,
        kind: "extracted_signal",
        relationship: "supports_problem",
        claim: problem.problem_summary,
        supports: [{ section: "problem_intelligence", field: "summary" }],
        confidence: score(problem.source_quality_score),
        provenanceIds: [discoveryId],
      },
      {
        evidenceId: opportunityEvidenceId,
        kind: "extracted_signal",
        relationship: "supports_opportunity",
        claim: problem.source_evidence,
        supports: [{ section: "opportunity_intelligence", field: "validation_indicators" }],
        confidence: score(problem.opportunity_score, 100),
        provenanceIds: [discoveryId],
      },
      ...externalEvidence,
      ...moatEvidence,
    ],
    confidence: {
      overall: score(problem.source_quality_score),
      evidence: score(problem.source_quality_score),
      opportunity: score(problem.opportunity_score, 100),
      market: score(problem.trend_score),
      calibration: {
        method: "heuristic",
        methodVersion: "discover-opportunities-snapshot@1.0",
        scoreScale: { min: 0, max: 1, interpretation: "Normalized from legacy discovery scores." },
      },
    },
    diagnostics: {
      items: [],
      processing: [
        { step: "discover_opportunities_analysis", status: "completed", warnings: [] },
        { step: "canonical_snapshot_adapter", status: "completed", warnings: [] },
      ],
      metrics: {
        externalSourceCount: input.externalSources.length,
        dataMoatSourceCount: input.moatSources.length,
        normalizedProblemCount: input.problems.length,
      },
    },
    versions: {
      intelligence: "discover-opportunities-workflow@1.0",
      normalization: "discover-opportunities-snapshot-adapter@1.0",
      confidence: "discover-opportunities-heuristic-confidence@1.0",
    },
    provenance: {
      runId: discoveryId,
      engineAttribution: [
        { engineName: "discover-opportunities-workflow", engineVersion: "1.0", section: "problemIntelligence" },
        { engineName: "discover-opportunities-workflow", engineVersion: "1.0", section: "opportunityIntelligence" },
        { engineName: "discover-opportunities-snapshot-adapter", engineVersion: "1.0", section: "diagnostics" },
      ],
      processingHistory: [
        { step: "opportunity_discovery_persisted", completedAt: createdAt, version: "1.0" },
        { step: "snapshot_adapter_completed", completedAt, version: "1.0" },
      ],
    },
  };
}
