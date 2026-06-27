import type { EvidenceInput, EvidenceSourceType } from "../evidence";
import type { FounderProfile } from "../engines/founder";
import type { DiscoverySource } from "../knowledge/discovery-data-moat-sources";
import type { DiscoveryInput } from "./types";

export type DiscoveryAdapterSource = DiscoverySource & {
  source_name?: string | null;
  raw_text?: string | null;
};

export type DiscoverySourceAdapterInput = {
  externalSources?: DiscoveryAdapterSource[];
  moatSources?: DiscoveryAdapterSource[];
  market?: string | null;
  audience?: string | null;
  region?: string | null;
  founderProfile?: FounderProfile | null;
  id?: string;
  requestedAt?: string | Date;
  context?: Record<string, unknown>;
};

function hasUsableText(source: DiscoveryAdapterSource) {
  return Boolean(
    String(source.raw_text || "").trim() ||
      String(source.snippet || "").trim() ||
      String(source.title || "").trim()
  );
}

function sourceName(source: DiscoveryAdapterSource) {
  return source.source_name || source.source_type;
}

function trimOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function stringValue(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeSourceToEvidenceInput(
  source: DiscoveryAdapterSource,
  sourceGroup: "external" | "data_moat",
  context: Pick<DiscoverySourceAdapterInput, "market" | "audience" | "region">
): EvidenceInput {
  const sourceType: EvidenceSourceType = sourceGroup === "data_moat" ? "data_moat" : "external_source";

  return {
    sourceType,
    sourceName: sourceName(source),
    sourceUrl: trimOrNull(source.url),
    capturedText:
      stringValue(source.raw_text) || stringValue(source.snippet) || stringValue(source.title),
    market: trimOrNull(context.market),
    audience: trimOrNull(context.audience),
    nicheCategory: trimOrNull(source.category) || source.source_type,
    provenance: {
      capturedBy: "discovery_source_adapter",
      raw: {
        ...source,
        source_group: sourceGroup,
        source_name: sourceName(source),
        region: context.region || null,
      },
    },
  };
}

export function validateDiscoveryAdapterSources(sources: DiscoveryAdapterSource[]) {
  return sources.filter(hasUsableText);
}

export function adaptDiscoverySourcesToInput({
  externalSources = [],
  moatSources = [],
  market = null,
  audience = null,
  region = null,
  founderProfile = null,
  id,
  requestedAt,
  context = {},
}: DiscoverySourceAdapterInput): DiscoveryInput {
  const validExternalSources = validateDiscoveryAdapterSources(externalSources);
  const validMoatSources = validateDiscoveryAdapterSources(moatSources);
  const sourceContext = { market, audience, region };

  return {
    id,
    sources: [
      ...validExternalSources.map((source) =>
        normalizeSourceToEvidenceInput(source, "external", sourceContext)
      ),
      ...validMoatSources.map((source) =>
        normalizeSourceToEvidenceInput(source, "data_moat", sourceContext)
      ),
    ],
    founderProfile,
    context: {
      ...context,
      market,
      audience,
      region,
      externalSourceCount: externalSources.length,
      dataMoatSourceCount: moatSources.length,
      validExternalSourceCount: validExternalSources.length,
      validDataMoatSourceCount: validMoatSources.length,
    },
    requestedAt,
  };
}
