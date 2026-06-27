import { NextResponse } from "next/server";

import { DiscoveryOrchestrator } from "../../../../lib/intelligence/orchestrator";
import type { EvidenceInput, EvidenceSourceType } from "../../../../lib/evidence";
import type { DiscoveryInput } from "../../../../lib/intelligence";
import type { FounderProfile } from "../../../../lib/engines/founder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 20_000;
const MAX_TEXT_LENGTH = 8_000;
const STRING_LIMITS = {
  market: 120,
  audience: 120,
  region: 80,
  sourceTitle: 180,
  sourceUrl: 500,
  sourceType: 80,
};

const allowedSourceTypes: EvidenceSourceType[] = [
  "external_source",
  "uploaded_document",
  "pasted_text",
  "scan_source",
  "weekly_intelligence_source",
  "feedback_event",
  "data_moat",
  "unknown",
];

type DryRunBody = {
  market?: unknown;
  audience?: unknown;
  region?: unknown;
  evidenceText?: unknown;
  sourceTitle?: unknown;
  sourceUrl?: unknown;
  sourceType?: unknown;
  founderProfile?: unknown;
};

function getInternalSecret() {
  return process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET || null;
}

function isAuthorized(request: Request) {
  const secret = getInternalSecret();
  const authorization = request.headers.get("authorization");

  return Boolean(secret && authorization === `Bearer ${secret}`);
}

function safeString(value: unknown, limit: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, limit);
}

function stringArray(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeSourceType(value: unknown): EvidenceSourceType {
  const sourceType = safeString(value, STRING_LIMITS.sourceType) as EvidenceSourceType;
  return allowedSourceTypes.includes(sourceType) ? sourceType : "pasted_text";
}

function normalizeFounderProfile(value: unknown): FounderProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const input = value as Record<string, unknown>;
  return {
    id: safeString(input.id, 120) || "dry-run-founder",
    name: safeString(input.name, 120) || null,
    skills: stringArray(input.skills),
    experience: stringArray(input.experience),
    interests: stringArray(input.interests),
    availableBudgetUsd: Number.isFinite(Number(input.availableBudgetUsd))
      ? Math.max(0, Number(input.availableBudgetUsd))
      : null,
    availableHoursPerWeek: Number.isFinite(Number(input.availableHoursPerWeek))
      ? Math.max(0, Number(input.availableHoursPerWeek))
      : null,
    metadata: { dryRun: true },
  };
}

function parseContentLength(request: Request) {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) return null;
  const length = Number(rawLength);
  return Number.isFinite(length) ? length : null;
}

async function parseDryRunBody(request: Request) {
  const text = await request.text();

  if (text.length > MAX_BODY_BYTES) {
    return { error: "Request body is too large." };
  }

  if (!text.trim()) return { body: {} as DryRunBody };

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: "Request body must be a JSON object." };
    }

    return { body: parsed as DryRunBody };
  } catch {
    return { error: "Invalid JSON body." };
  }
}

function createDiscoveryInput(body: DryRunBody): DiscoveryInput {
  const market = safeString(body.market, STRING_LIMITS.market);
  const audience = safeString(body.audience, STRING_LIMITS.audience);
  const region = safeString(body.region, STRING_LIMITS.region);
  const evidenceText = safeString(body.evidenceText, MAX_TEXT_LENGTH);
  const sourceTitle = safeString(body.sourceTitle, STRING_LIMITS.sourceTitle);
  const sourceUrl = safeString(body.sourceUrl, STRING_LIMITS.sourceUrl);
  const evidence: EvidenceInput = {
    sourceType: normalizeSourceType(body.sourceType),
    sourceName: sourceTitle || "Internal discovery dry-run evidence",
    sourceUrl: sourceUrl || null,
    capturedText:
      evidenceText ||
      [market && `Market: ${market}`, audience && `Audience: ${audience}`, region && `Region: ${region}`]
        .filter(Boolean)
        .join(". ") ||
      "Internal dry-run evidence placeholder.",
    extractedClaim: evidenceText ? evidenceText.slice(0, 500) : null,
    market: market || null,
    audience: audience || null,
    nicheCategory: region || null,
    confidenceScore: 6,
    sourceQualityScore: 5,
    provenance: {
      capturedBy: "internal_discovery_dry_run",
    },
  };

  return {
    query: market || evidenceText || "Internal Discovery Orchestrator dry run",
    sources: [evidence],
    founderProfile: normalizeFounderProfile(body.founderProfile),
    context: {
      dryRun: true,
      internal: true,
      region: region || null,
    },
  };
}

// Internal-only endpoint for validating the modular intelligence architecture before
// integrating the upgraded Discovery Orchestrator into production routes. This route
// runs fully in dry-run mode: no external APIs, OpenRouter calls, Supabase calls, or
// database writes are performed here.
export async function POST(request: Request) {
  if (!getInternalSecret()) {
    return NextResponse.json(
      { success: false, error: "Internal dry-run endpoint is not configured." },
      { status: 500 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const contentLength = parseContentLength(request);
  if (contentLength !== null && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { success: false, error: "Request body is too large." },
      { status: 400 }
    );
  }

  const parsed = await parseDryRunBody(request);
  if (parsed.error || !parsed.body) {
    return NextResponse.json(
      { success: false, error: parsed.error || "Invalid request body." },
      { status: 400 }
    );
  }

  const orchestrator = new DiscoveryOrchestrator();
  const result = orchestrator.runWithModularPipeline(createDiscoveryInput(parsed.body), {
    enabled: true,
    dryRun: true,
  });
  const modularPipeline = result.modularPipeline;
  const outputs = modularPipeline?.outputs;

  return NextResponse.json({
    success: true,
    dryRun: true,
    noDatabaseWrites: true,
    runId: result.runId,
    pipelineStagesExecuted: modularPipeline?.diagnostics
      .filter((diagnostic) => diagnostic.status === "completed")
      .map((diagnostic) => diagnostic.stage) || [],
    counts: {
      evidence: result.metrics.validEvidenceCount,
      knowledgeUpdates: result.metrics.knowledgeUpdateCount,
      painCandidates: outputs?.painDetection?.summary.candidateCount || 0,
      patternCandidates: outputs?.patternDetection?.summary.candidateCount || 0,
      trendCandidates: outputs?.trendDetection?.summary.candidateCount || 0,
      opportunityCandidates: outputs?.opportunityDetection?.summary.candidateCount || 0,
      monetizationCandidates: outputs?.monetizationEvaluation?.summary.candidateCount || 0,
      confidenceCandidates: outputs?.confidenceEvaluation?.summary.candidateCount || 0,
      deduplicationGroups: outputs?.semanticProblemDeduplication?.summary.groupCount || 0,
    },
    diagnostics: modularPipeline?.diagnostics || [],
    warnings: result.warnings,
    completedAt: result.completedAt,
  });
}
