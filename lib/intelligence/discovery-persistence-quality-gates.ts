import type { PlannedDiscoveredProblem } from "./discovery-orchestrator-persistence-plan";

export type DiscoveryPersistenceQualityGateSeverity = "warning" | "error";

export type DiscoveryPersistenceQualityGateIssue = {
  rowIndex: number;
  field?: keyof PlannedDiscoveredProblem;
  code:
    | "title_too_short"
    | "title_generic_keyword"
    | "summary_missing"
    | "summary_matches_title"
    | "summary_too_short"
    | "opportunity_score_too_low"
    | "all_primary_scores_minimum"
    | "source_evidence_too_long"
    | "source_evidence_missing"
    | "too_many_fallback_fields"
    | "build_difficulty_invalid";
  severity: DiscoveryPersistenceQualityGateSeverity;
  message: string;
};

export type DiscoveryPersistenceQualityGateSummary = {
  total_rows: number;
  accepted_row_count: number;
  rejected_row_count: number;
  issue_count: number;
  error_count: number;
  warning_count: number;
  issue_counts_by_code: Record<DiscoveryPersistenceQualityGateIssue["code"], number>;
  average_opportunity_score: number;
  fallback_field_count: number;
  rows_with_fallback_fields: number;
  max_source_evidence_length: number;
};

export type DiscoveryPersistenceQualityGateResult = {
  allRowsPass: boolean;
  acceptedRows: PlannedDiscoveredProblem[];
  rejectedRows: Array<{ rowIndex: number; row: PlannedDiscoveredProblem; issues: DiscoveryPersistenceQualityGateIssue[] }>;
  issues: DiscoveryPersistenceQualityGateIssue[];
  summary: DiscoveryPersistenceQualityGateSummary;
  safeDiagnostics: DiscoveryPersistenceQualityGateSummary & { selected: boolean };
};

type QualityGateOptions = {
  fallbackFieldsByRow?: Array<{ rowIndex: number; fields: Array<keyof PlannedDiscoveredProblem> }>;
};

const GENERIC_RAW_KEYWORDS = new Set([
  "manual",
  "billing",
  "approval",
  "spreadsheet",
  "spreadsheets",
  "automation",
  "operations",
]);

const VALID_BUILD_DIFFICULTIES = new Set(["Easy", "Medium", "Hard"]);
const MIN_TITLE_WORDS = 3;
const MIN_TITLE_LENGTH = 12;
const MIN_SUMMARY_WORDS = 8;
const MIN_SUMMARY_LENGTH = 48;
const MIN_ASSISTED_OPPORTUNITY_SCORE = 25;
const MAX_SOURCE_EVIDENCE_LENGTH = 900;
const MAX_FALLBACK_FIELDS_PER_ROW = 5;

function normalizeText(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(value: string) {
  return normalizeText(value).split(" ").filter(Boolean).length;
}

function similarity(left: string, right: string) {
  const leftTokens = new Set(normalizeText(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeText(right).split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function emptyIssueCounts(): DiscoveryPersistenceQualityGateSummary["issue_counts_by_code"] {
  return {
    title_too_short: 0,
    title_generic_keyword: 0,
    summary_missing: 0,
    summary_matches_title: 0,
    summary_too_short: 0,
    opportunity_score_too_low: 0,
    all_primary_scores_minimum: 0,
    source_evidence_too_long: 0,
    source_evidence_missing: 0,
    too_many_fallback_fields: 0,
    build_difficulty_invalid: 0,
  };
}

function issue(
  rowIndex: number,
  code: DiscoveryPersistenceQualityGateIssue["code"],
  field: keyof PlannedDiscoveredProblem | undefined,
  message: string
): DiscoveryPersistenceQualityGateIssue {
  return { rowIndex, code, field, severity: "error", message };
}

export function evaluateDiscoveryPersistenceQuality(
  rows: PlannedDiscoveredProblem[],
  options: QualityGateOptions = {}
): DiscoveryPersistenceQualityGateResult {
  const fallbackFieldsByRow = new Map(
    (options.fallbackFieldsByRow || []).map((entry) => [entry.rowIndex, entry.fields])
  );
  const issues: DiscoveryPersistenceQualityGateIssue[] = [];

  rows.forEach((row, rowIndex) => {
    const title = row.problem_title?.trim() || "";
    const normalizedTitle = normalizeText(title);
    const summary = row.problem_summary?.trim() || "";
    const evidence = row.source_evidence?.trim() || "";
    const fallbackFieldCount = fallbackFieldsByRow.get(rowIndex)?.length || 0;

    if (title.length < MIN_TITLE_LENGTH || wordCount(title) < MIN_TITLE_WORDS) {
      issues.push(issue(rowIndex, "title_too_short", "problem_title", "Problem title is too short for assisted persistence."));
    }
    if (GENERIC_RAW_KEYWORDS.has(normalizedTitle)) {
      issues.push(issue(rowIndex, "title_generic_keyword", "problem_title", "Problem title is only a generic raw keyword."));
    }
    if (!summary) {
      issues.push(issue(rowIndex, "summary_missing", "problem_summary", "Problem summary is missing."));
    } else {
      if (normalizeText(summary) === normalizedTitle || similarity(summary, title) >= 0.92) {
        issues.push(issue(rowIndex, "summary_matches_title", "problem_summary", "Problem summary duplicates the title."));
      }
      if (summary.length < MIN_SUMMARY_LENGTH || wordCount(summary) < MIN_SUMMARY_WORDS) {
        issues.push(issue(rowIndex, "summary_too_short", "problem_summary", "Problem summary is too short to explain a business problem."));
      }
    }
    if (!Number.isFinite(row.opportunity_score) || row.opportunity_score < MIN_ASSISTED_OPPORTUNITY_SCORE) {
      issues.push(issue(rowIndex, "opportunity_score_too_low", "opportunity_score", "Opportunity score is unrealistically low for assisted persistence."));
    }
    if (row.pain_score <= 1 && row.revenue_score <= 1 && row.urgency_score <= 1) {
      issues.push(issue(rowIndex, "all_primary_scores_minimum", "pain_score", "Pain, revenue, and urgency scores are all minimum values."));
    }
    if (!evidence) {
      issues.push(issue(rowIndex, "source_evidence_missing", "source_evidence", "Source evidence is missing."));
    } else if (evidence.length > MAX_SOURCE_EVIDENCE_LENGTH) {
      issues.push(issue(rowIndex, "source_evidence_too_long", "source_evidence", "Source evidence is too long for safe persistence."));
    }
    if (fallbackFieldCount > MAX_FALLBACK_FIELDS_PER_ROW) {
      issues.push(issue(rowIndex, "too_many_fallback_fields", undefined, "Too many persistence fields came from fallbacks."));
    }
    if (!VALID_BUILD_DIFFICULTIES.has(row.build_difficulty)) {
      issues.push(issue(rowIndex, "build_difficulty_invalid", "build_difficulty", "Build difficulty is missing or invalid."));
    }
  });

  const rejectedIndexSet = new Set(issues.map((entry) => entry.rowIndex));
  const rejectedRows = rows
    .map((row, rowIndex) => ({ rowIndex, row, issues: issues.filter((entry) => entry.rowIndex === rowIndex) }))
    .filter((entry) => entry.issues.length > 0);
  const acceptedRows = rows.filter((_, rowIndex) => !rejectedIndexSet.has(rowIndex));
  const issueCounts = emptyIssueCounts();
  issues.forEach((entry) => {
    issueCounts[entry.code] += 1;
  });
  const fallbackCounts = [...fallbackFieldsByRow.values()].map((fields) => fields.length);
  const opportunityScores = rows.map((row) => row.opportunity_score).filter(Number.isFinite);
  const summary: DiscoveryPersistenceQualityGateSummary = {
    total_rows: rows.length,
    accepted_row_count: acceptedRows.length,
    rejected_row_count: rejectedRows.length,
    issue_count: issues.length,
    error_count: issues.filter((entry) => entry.severity === "error").length,
    warning_count: issues.filter((entry) => entry.severity === "warning").length,
    issue_counts_by_code: issueCounts,
    average_opportunity_score:
      opportunityScores.length === 0
        ? 0
        : Math.round((opportunityScores.reduce((sum, score) => sum + score, 0) / opportunityScores.length) * 100) / 100,
    fallback_field_count: fallbackCounts.reduce((sum, count) => sum + count, 0),
    rows_with_fallback_fields: fallbackCounts.filter((count) => count > 0).length,
    max_source_evidence_length: rows.reduce((max, row) => Math.max(max, row.source_evidence?.length || 0), 0),
  };

  return {
    allRowsPass: rows.length > 0 && rejectedRows.length === 0,
    acceptedRows,
    rejectedRows,
    issues,
    summary,
    safeDiagnostics: { ...summary, selected: rows.length > 0 && rejectedRows.length === 0 },
  };
}
