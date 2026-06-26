import {
  createEvidence,
  validateEvidence,
  type Evidence,
} from "../evidence";
import {
  calculateKnowledgeConfidence,
  evidenceToKnowledgeUpdateInput,
  evaluateKnowledgeConsolidation,
  prepareProblemConsolidationCandidates,
  type KnowledgeConsolidationResult,
} from "../knowledge";
import { advanceDiscoveryStage, appendDiscoveryWarning, createInitialDiscoveryState } from "./state";
import type {
  DiscoveryDecisionContext,
  DiscoveryInput,
  DiscoveryMetrics,
  DiscoveryPipelineState,
  DiscoveryResult,
} from "./types";
import { validateDiscoveryState } from "./validation";

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function latestEvidenceAt(evidence: Evidence[]) {
  if (evidence.length === 0) return new Date().toISOString();
  return evidence
    .map((item) => item.capturedAt)
    .reduce((latest, value) => (Date.parse(value) > Date.parse(latest) ? value : latest));
}

function emptyConsolidation(): KnowledgeConsolidationResult {
  return {
    canonicalFingerprint: "",
    candidates: [],
    mergedEvidenceCount: 0,
    confidenceScore: 0,
    relationshipStrength: 0,
    shouldMerge: false,
    reasons: ["No knowledge updates are available for consolidation yet."],
  };
}

export class DiscoveryOrchestrator {
  createState(input: DiscoveryInput): DiscoveryPipelineState {
    return createInitialDiscoveryState(input);
  }

  /**
   * Information Sources → Evidence Layer.
   * Captures provided source payloads as evidence-shaped records without reaching external systems.
   */
  collectEvidence(state: DiscoveryPipelineState): DiscoveryPipelineState {
    return advanceDiscoveryStage(
      {
        ...state,
        collectedEvidence: state.rawEvidenceInputs.map((input) => createEvidence(input)),
      },
      "evidence_collected"
    );
  }

  /**
   * Evidence Layer normalization.
   * Validates and keeps only reusable evidence objects so future engines reason over evidence, not raw input.
   */
  normalizeEvidence(state: DiscoveryPipelineState): DiscoveryPipelineState {
    const validation = state.collectedEvidence.map((evidence) => validateEvidence(evidence));
    const normalizedEvidence = state.collectedEvidence.filter((_, index) => validation[index].valid);
    const invalidCount = validation.filter((result) => !result.valid).length;
    const nextState = advanceDiscoveryStage(
      {
        ...state,
        normalizedEvidence,
        evidenceValidation: validation,
      },
      "evidence_normalized"
    );

    if (invalidCount === 0) return nextState;

    return appendDiscoveryWarning(nextState, `${invalidCount} evidence item(s) failed validation.`);
  }

  /**
   * Evidence Layer → Knowledge Layer.
   * Converts valid evidence into typed knowledge update candidates using existing foundational mappers.
   */
  buildKnowledgeUpdates(state: DiscoveryPipelineState): DiscoveryPipelineState {
    return advanceDiscoveryStage(
      {
        ...state,
        knowledgeUpdates: state.normalizedEvidence.map((evidence) => evidenceToKnowledgeUpdateInput(evidence)),
      },
      "knowledge_updates_built"
    );
  }

  /**
   * Knowledge Layer consolidation.
   * Groups update candidates and prepares deterministic consolidation metadata without persisting changes.
   */
  consolidateKnowledge(state: DiscoveryPipelineState): DiscoveryPipelineState {
    const candidates = prepareProblemConsolidationCandidates(state.knowledgeUpdates);
    const consolidation = candidates.length > 0 ? evaluateKnowledgeConsolidation(candidates) : emptyConsolidation();

    return advanceDiscoveryStage(
      {
        ...state,
        consolidation,
      },
      "knowledge_consolidated"
    );
  }

  /**
   * Intelligence confidence evaluation.
   * Computes a pipeline-level confidence placeholder from evidence quality, source quality, and recency.
   */
  evaluateConfidence(state: DiscoveryPipelineState): DiscoveryPipelineState {
    const confidenceScore = calculateKnowledgeConfidence({
      evidenceCount: state.normalizedEvidence.length,
      averageEvidenceConfidence: average(
        state.normalizedEvidence.map((evidence) => evidence.confidenceScore ?? 5)
      ),
      averageSourceQuality: average(
        state.normalizedEvidence.map((evidence) => evidence.sourceQualityScore ?? 5)
      ),
      latestEvidenceAt: latestEvidenceAt(state.normalizedEvidence),
    });

    return advanceDiscoveryStage(
      {
        ...state,
        confidenceScore,
      },
      "confidence_evaluated"
    );
  }

  /**
   * Decision Layer preparation.
   * Packages evidence, knowledge updates, consolidation output, and confidence for future engines.
   */
  prepareDecisionContext(state: DiscoveryPipelineState): DiscoveryPipelineState {
    const decisionContext: DiscoveryDecisionContext = {
      evidence: state.normalizedEvidence,
      knowledgeUpdates: state.knowledgeUpdates,
      consolidation: state.consolidation || emptyConsolidation(),
      confidenceScore: state.confidenceScore ?? 0,
      rationale: [
        "Discovery orchestration completed with deterministic placeholders only.",
        "No production routes, storage, prompts, or UI behavior were changed.",
      ],
    };

    return advanceDiscoveryStage(
      {
        ...state,
        decisionContext,
      },
      "decision_context_prepared"
    );
  }

  /**
   * Output Layer preparation.
   * Produces a reusable typed result for future integration points without side effects.
   */
  produceDiscoveryResult(state: DiscoveryPipelineState): DiscoveryPipelineState {
    const decisionContext = state.decisionContext || {
      evidence: [],
      knowledgeUpdates: [],
      consolidation: emptyConsolidation(),
      confidenceScore: 0,
      rationale: ["Discovery result was produced before a decision context was available."],
    };
    const metrics = this.calculateMetrics(state, decisionContext.confidenceScore);
    const result: DiscoveryResult = {
      runId: state.context.runId,
      stage: "result_produced",
      decisionContext,
      metrics,
      warnings: state.warnings,
      completedAt: new Date().toISOString(),
    };

    return advanceDiscoveryStage(
      {
        ...state,
        result,
      },
      "result_produced"
    );
  }

  run(input: DiscoveryInput): DiscoveryResult {
    const state = this.produceDiscoveryResult(
      this.prepareDecisionContext(
        this.evaluateConfidence(
          this.consolidateKnowledge(this.buildKnowledgeUpdates(this.normalizeEvidence(this.collectEvidence(this.createState(input)))))
        )
      )
    );
    const validation = validateDiscoveryState(state);

    if (!validation.valid || !state.result) {
      throw new Error(`Invalid discovery pipeline state: ${validation.errors.join(" ")}`);
    }

    return state.result;
  }

  private calculateMetrics(
    state: DiscoveryPipelineState,
    confidenceScore: number
  ): DiscoveryMetrics {
    return {
      evidenceInputCount: state.rawEvidenceInputs.length,
      evidenceCount: state.collectedEvidence.length,
      validEvidenceCount: state.normalizedEvidence.length,
      knowledgeUpdateCount: state.knowledgeUpdates.length,
      relationshipCount: state.knowledgeUpdates.reduce(
        (sum, update) => sum + update.relationships.length,
        0
      ),
      consolidationCandidateCount: state.consolidation?.candidates.length || 0,
      confidenceScore,
      completedStageCount: state.completedStages.includes("result_produced")
        ? state.completedStages.length
        : state.completedStages.length + 1,
    };
  }
}
