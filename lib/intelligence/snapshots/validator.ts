import type { Snapshot, SnapshotSectionIdentifier, SnapshotSupportTargetField } from "./types";

export type SnapshotValidationSeverity = "error" | "warning";

export type SnapshotValidationIssue = Readonly<{
  severity: SnapshotValidationSeverity;
  code: string;
  path: string;
  message: string;
}>;

export type SnapshotValidationSummary = Readonly<{
  errorCount: number;
  warningCount: number;
  evidenceCount: number;
  referencedEvidenceCount: number;
  checkedForbiddenRuntimeFields: number;
  checkedScores: number;
}>;

export type SnapshotValidationResult = Readonly<{
  valid: boolean;
  errors: readonly SnapshotValidationIssue[];
  warnings: readonly SnapshotValidationIssue[];
  summary: SnapshotValidationSummary;
}>;

const REQUIRED_TOP_LEVEL_SECTIONS = [
  "metadata",
  "discoveryContext",
  "problemIntelligence",
  "opportunityIntelligence",
  "evidence",
  "confidence",
  "diagnostics",
  "versions",
  "provenance",
] as const;

const OPTIONAL_TOP_LEVEL_SECTIONS = ["founderIntelligence"] as const;

const ALLOWED_TOP_LEVEL_SECTIONS = new Set<string>([
  ...REQUIRED_TOP_LEVEL_SECTIONS,
  ...OPTIONAL_TOP_LEVEL_SECTIONS,
]);

const FORBIDDEN_RUNTIME_FIELDS = new Set<string>([
  "rawProviderPayload",
  "promptHistory",
  "runtimeDebug",
  "uiState",
  "providerRequestId",
  "tokenUsage",
  "supabaseClient",
  "openaiResponse",
  "serpApiPayload",
  "xApiPayload",
]);

const CANONICAL_SUPPORT_SECTIONS = new Set<SnapshotSectionIdentifier>([
  "metadata",
  "discovery_context",
  "problem_intelligence",
  "opportunity_intelligence",
  "founder_intelligence",
  "evidence",
  "confidence",
  "diagnostics",
  "versions",
  "provenance",
]);

const CANONICAL_SUPPORT_FIELDS = new Set<SnapshotSupportTargetField>([
  "title",
  "summary",
  "pain_description",
  "affected_market",
  "affected_audience",
  "pain_severity",
  "frequency",
  "urgency",
  "existing_workarounds",
  "related_niches",
  "opportunity_score",
  "market_size_signals",
  "competitive_signals",
  "build_simplicity",
  "willingness_to_pay",
  "revenue_potential",
  "risk_indicators",
  "validation_indicators",
  "founder_score",
  "founder_fit",
  "technical_complexity",
  "domain_match",
  "distribution_match",
  "execution_difficulty",
  "founder_advantages",
  "founder_risks",
  "overall",
  "evidence",
  "opportunity",
  "founder",
  "market",
  "diagnostic_item",
  "processing_step",
  "metric",
]);

type MutableSummary = {
  evidenceCount: number;
  referencedEvidenceCount: number;
  checkedForbiddenRuntimeFields: number;
  checkedScores: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function addIssue(
  issues: SnapshotValidationIssue[],
  severity: SnapshotValidationSeverity,
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ severity, code, path, message });
}

function validateScore(
  value: unknown,
  path: string,
  issues: SnapshotValidationIssue[],
  summary: MutableSummary,
): void {
  if (!isRecord(value) || !("value" in value)) return;

  summary.checkedScores += 1;
  const score = value.value;

  if (!isFiniteNumber(score)) {
    addIssue(issues, "error", "INVALID_SCORE_NUMBER", `${path}.value`, "Score value must be a finite number.");
    return;
  }

  if (score < 0 || score > 1) {
    addIssue(issues, "error", "SCORE_OUT_OF_RANGE", `${path}.value`, "Score value must be within the canonical 0-1 range.");
  }
}

function walkSnapshot(
  value: unknown,
  path: string,
  issues: SnapshotValidationIssue[],
  summary: MutableSummary,
): void {
  if (Array.isArray(value)) {
    if (!Object.isFrozen(value)) {
      addIssue(issues, "error", "MUTABLE_SNAPSHOT_STRUCTURE", path, "Snapshot arrays must be frozen before validation/persistence.");
    }
    value.forEach((item, index) => walkSnapshot(item, `${path}[${index}]`, issues, summary));
    return;
  }

  if (!isRecord(value)) return;

  if (!Object.isFrozen(value)) {
    addIssue(issues, "error", "MUTABLE_SNAPSHOT_STRUCTURE", path, "Snapshot objects must be frozen before validation/persistence.");
  }

  validateScore(value, path, issues, summary);

  for (const [key, nestedValue] of Object.entries(value)) {
    summary.checkedForbiddenRuntimeFields += 1;
    const nestedPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_RUNTIME_FIELDS.has(key)) {
      addIssue(issues, "error", "FORBIDDEN_RUNTIME_FIELD", nestedPath, `Forbidden runtime field "${key}" must not appear in a Snapshot.`);
    }
    walkSnapshot(nestedValue, nestedPath, issues, summary);
  }
}

function collectReferencedEvidence(snapshot: Partial<Snapshot>, issues: SnapshotValidationIssue[]): Set<string> {
  const referenced = new Set<string>();
  const addReferences = (values: unknown, path: string) => {
    if (!Array.isArray(values)) {
      addIssue(issues, "error", "INVALID_EVIDENCE_REFERENCES", path, "Evidence references must be arrays.");
      return;
    }
    values.forEach((value, index) => {
      if (isNonEmptyString(value)) referenced.add(value);
      else addIssue(issues, "error", "INVALID_EVIDENCE_REFERENCE", `${path}[${index}]`, "Evidence references must be non-empty strings.");
    });
  };

  if (snapshot.problemIntelligence) addReferences(snapshot.problemIntelligence.evidenceIds, "problemIntelligence.evidenceIds");
  if (snapshot.opportunityIntelligence) addReferences(snapshot.opportunityIntelligence.evidenceIds, "opportunityIntelligence.evidenceIds");
  if (snapshot.founderIntelligence) addReferences(snapshot.founderIntelligence.evidenceIds, "founderIntelligence.evidenceIds");
  snapshot.diagnostics?.items?.forEach((item, index) => addReferences(item.relatedEvidenceIds, `diagnostics.items[${index}].relatedEvidenceIds`));

  return referenced;
}

export function validateSnapshot(snapshot: unknown): SnapshotValidationResult {
  const issues: SnapshotValidationIssue[] = [];
  const warnings: SnapshotValidationIssue[] = [];
  const summary: MutableSummary = { evidenceCount: 0, referencedEvidenceCount: 0, checkedForbiddenRuntimeFields: 0, checkedScores: 0 };

  if (!isRecord(snapshot)) {
    addIssue(issues, "error", "INVALID_SNAPSHOT", "", "Snapshot must be an object.");
  } else {
    for (const section of REQUIRED_TOP_LEVEL_SECTIONS) {
      if (!(section in snapshot)) addIssue(issues, "error", "MISSING_REQUIRED_SECTION", section, `Snapshot is missing required section "${section}".`);
    }

    for (const key of Object.keys(snapshot).sort()) {
      if (!ALLOWED_TOP_LEVEL_SECTIONS.has(key)) addIssue(issues, "error", "UNKNOWN_TOP_LEVEL_SECTION", key, `Unknown top-level Snapshot section "${key}" is not part of the frozen contract.`);
    }

    const partialSnapshot = snapshot as Partial<Snapshot>;

    if (!isNonEmptyString(partialSnapshot.metadata?.snapshotId)) addIssue(issues, "error", "MISSING_SNAPSHOT_ID", "metadata.snapshotId", "Snapshot identity requires snapshotId.");
    if (!isNonEmptyString(partialSnapshot.metadata?.discoveryId)) addIssue(issues, "error", "MISSING_DISCOVERY_ID", "metadata.discoveryId", "Snapshot identity requires discoveryId.");
    if (!isNonEmptyString(partialSnapshot.metadata?.createdAt)) addIssue(issues, "error", "MISSING_CREATED_AT", "metadata.createdAt", "Snapshot identity requires createdAt.");
    if (!isNonEmptyString(partialSnapshot.metadata?.snapshotVersion)) addIssue(issues, "error", "MISSING_SNAPSHOT_VERSION", "metadata.snapshotVersion", "Snapshot metadata requires snapshotVersion.");
    if (!isNonEmptyString(partialSnapshot.metadata?.contractVersion)) addIssue(issues, "error", "MISSING_CONTRACT_VERSION", "metadata.contractVersion", "Snapshot metadata requires contractVersion.");
    if (!isNonEmptyString(partialSnapshot.versions?.snapshotContract)) addIssue(issues, "error", "MISSING_VERSION", "versions.snapshotContract", "Snapshot versions require snapshotContract.");
    if (!isNonEmptyString(partialSnapshot.versions?.engine)) addIssue(issues, "error", "MISSING_VERSION", "versions.engine", "Snapshot versions require engine.");
    if (!isNonEmptyString(partialSnapshot.versions?.intelligence)) addIssue(issues, "error", "MISSING_VERSION", "versions.intelligence", "Snapshot versions require intelligence.");

    walkSnapshot(snapshot, "snapshot", issues, summary);

    const referencedEvidence = collectReferencedEvidence(partialSnapshot, issues);
    summary.referencedEvidenceCount = referencedEvidence.size;

    if (!Array.isArray(partialSnapshot.evidence)) {
      addIssue(issues, "error", "INVALID_EVIDENCE_SECTION", "evidence", "Snapshot evidence must be an array.");
    } else {
      summary.evidenceCount = partialSnapshot.evidence.length;
      const seenEvidenceIds = new Set<string>();
      partialSnapshot.evidence.forEach((evidence, index) => {
        const path = `evidence[${index}]`;
        if (!isNonEmptyString(evidence.evidenceId)) {
          addIssue(issues, "error", "MISSING_EVIDENCE_ID", `${path}.evidenceId`, "Every evidence item requires an evidenceId.");
          return;
        }
        if (seenEvidenceIds.has(evidence.evidenceId)) addIssue(issues, "error", "DUPLICATE_EVIDENCE_ID", `${path}.evidenceId`, `Duplicate evidenceId "${evidence.evidenceId}" is not allowed.`);
        seenEvidenceIds.add(evidence.evidenceId);

        if (!Array.isArray(evidence.provenanceIds) || evidence.provenanceIds.length === 0 || evidence.provenanceIds.some((id: unknown) => !isNonEmptyString(id))) {
          addIssue(issues, "error", "MISSING_EVIDENCE_PROVENANCE", `${path}.provenanceIds`, "Every evidence item must preserve non-empty provenanceIds.");
        }

        if (!Array.isArray(evidence.supports) || evidence.supports.length === 0) {
          addIssue(issues, "error", "INVALID_SUPPORT_TARGET", `${path}.supports`, "Evidence must include at least one canonical support target.");
        } else {
          evidence.supports.forEach((support: unknown, supportIndex: number) => {
            const supportPath = `${path}.supports[${supportIndex}]`;
            if (!isRecord(support)) {
              addIssue(issues, "error", "INVALID_SUPPORT_TARGET", supportPath, "Support target must be an object.");
              return;
            }
            if (!CANONICAL_SUPPORT_SECTIONS.has(support.section as SnapshotSectionIdentifier)) addIssue(issues, "error", "INVALID_SUPPORT_TARGET", `${supportPath}.section`, "Support target section must be canonical.");
            if (support.field !== undefined && !CANONICAL_SUPPORT_FIELDS.has(support.field as SnapshotSupportTargetField)) addIssue(issues, "error", "INVALID_SUPPORT_TARGET", `${supportPath}.field`, "Support target field must be canonical.");
          });
        }
      });

      referencedEvidence.forEach((evidenceId) => {
        if (!seenEvidenceIds.has(evidenceId)) addIssue(issues, "error", "ORPHAN_EVIDENCE_REFERENCE", "evidence", `Referenced evidenceId "${evidenceId}" does not exist in evidence.`);
      });
      seenEvidenceIds.forEach((evidenceId) => {
        if (!referencedEvidence.has(evidenceId)) addIssue(issues, "error", "ORPHAN_EVIDENCE", "evidence", `EvidenceId "${evidenceId}" is not referenced by any intelligence or diagnostic section.`);
      });
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error").sort((a, b) => `${a.path}:${a.code}`.localeCompare(`${b.path}:${b.code}`));
  const sortedWarnings = warnings.sort((a, b) => `${a.path}:${a.code}`.localeCompare(`${b.path}:${b.code}`));

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    warnings: Object.freeze(sortedWarnings),
    summary: Object.freeze({
      errorCount: errors.length,
      warningCount: sortedWarnings.length,
      ...summary,
    }),
  });
}
