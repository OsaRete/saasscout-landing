import { createHash } from "node:crypto";

import { normalizeProblemText } from "../deduplication/helpers.ts";
import {
  CANONICAL_BOOTSTRAP_ACTIVATION_PLAN_RULE_VERSION,
  CROSS_CANDIDATE_IDENTITY_AUDIT_RULE_VERSION,
  type BootstrapCandidateCluster,
  type CanonicalBootstrapActivationPlan,
  type CanonicalBootstrapReport,
  type CandidateActivationSnapshot,
} from "./types.ts";

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export class CanonicalBootstrapError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}

function assertEligible(candidate: BootstrapCandidateCluster, report: CanonicalBootstrapReport) {
  const collisionMembers = new Set(report.crossCandidateIdentityAudit.potentialCollisionGroups.flat());
  if (candidate.disposition !== "high_confidence_cluster" || candidate.baseActivationDisposition !== "auto_activatable" ||
      candidate.crossCandidateAuditDisposition !== "clearly_unique" || candidate.finalActivationDisposition !== "auto_activatable" ||
      candidate.observations.length < 2 || collisionMembers.has(candidate.candidateId) ||
      report.crossCandidateIdentityAudit.blockedAutoActivatableCandidateIds.includes(candidate.candidateId)) {
    throw new CanonicalBootstrapError("canonical_bootstrap_preflight_failed");
  }
}

export function buildCandidateSnapshot(candidate: BootstrapCandidateCluster, report: CanonicalBootstrapReport): CandidateActivationSnapshot {
  assertEligible(candidate, report);
  const identity = {
    candidateId: candidate.candidateId,
    candidateCanonicalTitle: candidate.candidateCanonicalTitle,
    candidateNormalizedTitle: normalizeProblemText(candidate.candidateCanonicalTitle),
    observationIds: candidate.observations.map(({ id }) => id).sort(compare),
    aliases: [...new Map(candidate.aliasesPreview.map((alias) => [alias.normalizedAlias, { text: alias.text, normalizedAlias: alias.normalizedAlias }])).values()]
      .sort((a, b) => compare(a.normalizedAlias, b.normalizedAlias)),
    baseActivationDisposition: candidate.baseActivationDisposition,
    crossCandidateAuditDisposition: candidate.crossCandidateAuditDisposition,
    finalActivationDisposition: candidate.finalActivationDisposition,
    bootstrapRuleVersion: report.bootstrapRuleVersion,
    activationEligibilityRuleVersion: report.activationEligibilityRuleVersion,
    crossCandidateAuditRuleVersion: CROSS_CANDIDATE_IDENTITY_AUDIT_RULE_VERSION,
  };
  return { ...identity, candidateSnapshotHash: hash(identity) };
}

export function buildActivationPlan(report: CanonicalBootstrapReport): CanonicalBootstrapActivationPlan {
  const candidates = report.clusters.filter((item) => item.finalActivationDisposition === "auto_activatable")
    .map((item) => buildCandidateSnapshot(item, report)).sort((a, b) => compare(a.candidateId, b.candidateId));
  const planIdentity = {
    ruleVersion: CANONICAL_BOOTSTRAP_ACTIVATION_PLAN_RULE_VERSION,
    bootstrapRuleVersion: report.bootstrapRuleVersion,
    activationEligibilityRuleVersion: report.activationEligibilityRuleVersion,
    crossCandidateAuditRuleVersion: CROSS_CANDIDATE_IDENTITY_AUDIT_RULE_VERSION,
    candidates: candidates.map(({ candidateId, candidateSnapshotHash }) => ({ candidateId, candidateSnapshotHash })),
  };
  return { ruleVersion: CANONICAL_BOOTSTRAP_ACTIVATION_PLAN_RULE_VERSION, eligibleCandidateCount: candidates.length,
    candidateIds: candidates.map(({ candidateId }) => candidateId), candidateSnapshotHashes: candidates.map(({ candidateSnapshotHash }) => candidateSnapshotHash),
    candidates, activationPlanHash: hash(planIdentity) };
}
