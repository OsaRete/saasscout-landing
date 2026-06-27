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
import { ProblemDeduplicationEngine } from "../knowledge/deduplication";
import { PainDetectionEngine } from "../engines/pain";
import { PatternDetectionEngine } from "../engines/pattern";
import { TrendEngine } from "../engines/trend";
import { OpportunityEngine } from "../engines/opportunity";
import { MonetizationEngine } from "../engines/monetization";
import { FounderIntelligenceEngine } from "../engines/founder";
import { ConfidenceEngine } from "../engines/confidence";
import { FeedbackEngine } from "../engines/feedback";
import { advanceDiscoveryStage, appendDiscoveryWarning, createInitialDiscoveryState } from "./state";
import type {
  DiscoveryDecisionContext,
  DiscoveryInput,
  DiscoveryMetrics,
  DiscoveryModularPipelineOptions,
  DiscoveryModularPipelineOutputs,
  DiscoveryModularPipelineResult,
  DiscoveryPipelineState,
  DiscoveryStageStatus,
  DiscoveryPipelineStage,
  DiscoveryPipelineStageDiagnostic,
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

const defaultModularStages: DiscoveryPipelineStage[] = [
  "evidence_normalization",
  "knowledge_update_preparation",
  "pain_detection",
  "pattern_detection",
  "trend_detection",
  "opportunity_detection",
  "monetization_evaluation",
  "founder_intelligence",
  "confidence_evaluation",
  "feedback_learning",
  "semantic_problem_deduplication",
];

export class DiscoveryOrchestrator {
  createState(input: DiscoveryInput): DiscoveryPipelineState {
    return createInitialDiscoveryState(input);
  }

  /** Returns the minimal input contracts each optional modular stage needs before it can run safely. */
  getRequiredInputsForModularStage(stage: DiscoveryPipelineStage) {
    if (stage === "evidence_normalization") return ["rawEvidenceInputs"];
    if (stage === "knowledge_update_preparation" || stage === "pain_detection") return ["normalizedEvidence"];
    if (stage === "founder_intelligence") return ["founderProfile"];
    return [];
  }

  /** Validates stage readiness without throwing so future route integrations can decide whether to skip or request more context. */
  validateModularStageInputs(stage: DiscoveryPipelineStage, availableInputs: string[]): DiscoveryPipelineStageDiagnostic {
    const requiredInputs = this.getRequiredInputsForModularStage(stage);
    const missingInputs = requiredInputs.filter((input) => !availableInputs.includes(input));
    return { stage, status: missingInputs.length > 0 ? "skipped" : "ready", requiredInputs, availableInputs, missingInputs, warnings: [] };
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
      modularPipeline: state.modularPipeline || undefined,
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

  /**
   * Future bridge between route-level discovery and SaaSScout's long-term intelligence architecture.
   * This modular path coordinates Evidence, Knowledge, Detection Engines, Confidence, Feedback and
   * semantic deduplication in memory only. It intentionally performs no route work, prompt work,
   * external API calls, OpenRouter calls, Supabase writes, or database writes, so it can be adopted
   * later by `/api/discover-opportunities` without changing today's product behavior.
   */
  runModularPipeline(input: DiscoveryInput, options: DiscoveryModularPipelineOptions = { dryRun: true }): DiscoveryModularPipelineResult {
    const state = this.normalizeEvidence(this.collectEvidence(this.createState(input)));
    return this.executeModularPipeline(state, options);
  }

  /**
   * Executes the optional modular pipeline against an existing Discovery state.
   * Dry-run mode returns typed outputs, pipeline state and diagnostics for integration testing before persistence exists.
   */
  executeModularPipeline(state: DiscoveryPipelineState, options: DiscoveryModularPipelineOptions = { dryRun: true }): DiscoveryModularPipelineResult {
    const stages = options.stages || defaultModularStages;
    const diagnostics: DiscoveryPipelineStageDiagnostic[] = [];
    const outputs: DiscoveryModularPipelineOutputs = {};
    const warnings = [...state.warnings];
    const runId = state.context.runId;
    const detectedAt = state.context.requestedAt;
    const knownProblems = state.input.knownProblems || [];
    const relationships = state.input.relationships || [];
    const feedbackEvents = state.input.feedbackEvents || [];

    const include = (stage: DiscoveryPipelineStage) => stages.includes(stage);
    const addDiagnostic = (stage: DiscoveryPipelineStage, requiredInputs: string[], availableInputs: string[], stageWarnings: string[] = []) => {
      const readiness = this.validateModularStageInputs(stage, availableInputs);
      const status: DiscoveryStageStatus = requiredInputs.length > 0 && readiness.missingInputs.length > 0 ? "skipped" : "ready";
      const diagnostic = { ...readiness, status, requiredInputs, warnings: stageWarnings };
      diagnostics.push(diagnostic);
      warnings.push(...stageWarnings);
      return diagnostic;
    };
    const markCompleted = (stage: DiscoveryPipelineStage) => {
      const diagnostic = diagnostics.find((item) => item.stage === stage);
      if (diagnostic) diagnostic.status = "completed";
    };

    if (include("evidence_normalization")) {
      addDiagnostic("evidence_normalization", ["rawEvidenceInputs"], state.rawEvidenceInputs.length > 0 ? ["rawEvidenceInputs"] : [], state.normalizedEvidence.length === 0 ? ["No valid evidence was available; downstream engines will use safe empty inputs."] : []);
      outputs.evidenceNormalization = { evidence: state.normalizedEvidence, validation: state.evidenceValidation };
      markCompleted("evidence_normalization");
    }

    if (include("knowledge_update_preparation")) {
      addDiagnostic("knowledge_update_preparation", ["normalizedEvidence"], state.normalizedEvidence.length > 0 ? ["normalizedEvidence"] : [], state.normalizedEvidence.length === 0 ? ["Knowledge update preparation skipped because no normalized evidence is available."] : []);
      outputs.knowledgeUpdatePreparation = { knowledgeUpdates: state.normalizedEvidence.map((evidence) => evidenceToKnowledgeUpdateInput(evidence)) };
      markCompleted("knowledge_update_preparation");
    }

    const evidence = outputs.evidenceNormalization?.evidence || state.normalizedEvidence;
    const knowledgeUpdates = outputs.knowledgeUpdatePreparation?.knowledgeUpdates || state.knowledgeUpdates || [];
    const baseInput = { evidence, knowledgeUpdates, knownProblems, relationships, runId, detectedAt };

    if (include("pain_detection")) {
      const diagnostic = addDiagnostic("pain_detection", ["normalizedEvidence"], evidence.length > 0 ? ["normalizedEvidence"] : [], evidence.length === 0 ? ["Pain Detection safely skipped because evidence is required."] : []);
      if (diagnostic.status !== "skipped") {
        outputs.painDetection = new PainDetectionEngine().run(baseInput);
        markCompleted("pain_detection");
      }
    }

    if (include("pattern_detection")) {
      addDiagnostic("pattern_detection", [], ["normalizedEvidence", "painCandidates"]);
      outputs.patternDetection = new PatternDetectionEngine().run({ ...baseInput, painCandidates: outputs.painDetection?.candidates || [], painSignals: outputs.painDetection?.signals || [] });
      markCompleted("pattern_detection");
    }

    if (include("trend_detection")) {
      addDiagnostic("trend_detection", [], ["normalizedEvidence", "painCandidates", "patternCandidates"]);
      outputs.trendDetection = new TrendEngine().run({ ...baseInput, painCandidates: outputs.painDetection?.candidates || [], painSignals: outputs.painDetection?.signals || [], patternCandidates: outputs.patternDetection?.candidates || [], patternSignals: outputs.patternDetection?.signals || [] });
      markCompleted("trend_detection");
    }

    if (include("opportunity_detection")) {
      addDiagnostic("opportunity_detection", [], ["normalizedEvidence", "painCandidates", "patternCandidates", "trendCandidates"]);
      outputs.opportunityDetection = new OpportunityEngine().run({ ...baseInput, painCandidates: outputs.painDetection?.candidates || [], painSignals: outputs.painDetection?.signals || [], patternCandidates: outputs.patternDetection?.candidates || [], patternSignals: outputs.patternDetection?.signals || [], trendCandidates: outputs.trendDetection?.candidates || [], trendSignals: outputs.trendDetection?.signals || [] });
      markCompleted("opportunity_detection");
    }

    if (include("monetization_evaluation")) {
      addDiagnostic("monetization_evaluation", [], ["opportunityCandidates"]);
      outputs.monetizationEvaluation = new MonetizationEngine().run({ ...baseInput, opportunityCandidates: outputs.opportunityDetection?.candidates || [], opportunitySignals: outputs.opportunityDetection?.signals || [], painCandidates: outputs.painDetection?.candidates || [], patternCandidates: outputs.patternDetection?.candidates || [], trendCandidates: outputs.trendDetection?.candidates || [] });
      markCompleted("monetization_evaluation");
    }

    if (include("founder_intelligence")) {
      const diagnostic = addDiagnostic("founder_intelligence", ["founderProfile"], state.input.founderProfile ? ["founderProfile"] : [], state.input.founderProfile ? [] : ["Founder Intelligence skipped because no founder profile was provided."]);
      if (diagnostic.status !== "skipped" && state.input.founderProfile) {
        outputs.founderIntelligence = new FounderIntelligenceEngine().run({ ...baseInput, founderProfile: state.input.founderProfile, opportunityCandidates: outputs.opportunityDetection?.candidates || [], monetizationCandidates: outputs.monetizationEvaluation?.candidates || [], painCandidates: outputs.painDetection?.candidates || [], patternCandidates: outputs.patternDetection?.candidates || [], trendCandidates: outputs.trendDetection?.candidates || [], evaluatedAt: detectedAt });
        markCompleted("founder_intelligence");
      }
    }

    if (include("confidence_evaluation")) {
      addDiagnostic("confidence_evaluation", [], ["evidence", "engineCandidates"]);
      outputs.confidenceEvaluation = new ConfidenceEngine().run({ ...baseInput, painCandidates: outputs.painDetection?.candidates || [], patternCandidates: outputs.patternDetection?.candidates || [], trendCandidates: outputs.trendDetection?.candidates || [], opportunityCandidates: outputs.opportunityDetection?.candidates || [], monetizationCandidates: outputs.monetizationEvaluation?.candidates || [], founderFits: outputs.founderIntelligence?.opportunityFits || [] });
      markCompleted("confidence_evaluation");
    }

    if (include("feedback_learning")) {
      addDiagnostic("feedback_learning", [], feedbackEvents.length > 0 ? ["feedbackEvents"] : [], feedbackEvents.length === 0 ? ["Feedback Learning ran as an empty placeholder because no feedback events were provided."] : []);
      outputs.feedbackLearning = new FeedbackEngine().run({ ...baseInput, events: feedbackEvents, painCandidates: outputs.painDetection?.candidates || [], patternCandidates: outputs.patternDetection?.candidates || [], trendCandidates: outputs.trendDetection?.candidates || [], opportunityCandidates: outputs.opportunityDetection?.candidates || [], monetizationCandidates: outputs.monetizationEvaluation?.candidates || [], founderFits: outputs.founderIntelligence?.opportunityFits || [], confidenceCandidates: outputs.confidenceEvaluation?.candidates || [], learnedAt: detectedAt });
      markCompleted("feedback_learning");
    }

    if (include("semantic_problem_deduplication")) {
      addDiagnostic("semantic_problem_deduplication", [], ["evidence", "knowledge", "engineCandidates"]);
      outputs.semanticProblemDeduplication = new ProblemDeduplicationEngine().produceDeduplicationResult({ evidence, knownProblems, relationships, painCandidates: outputs.painDetection?.candidates || [], patternCandidates: outputs.patternDetection?.candidates || [], trendCandidates: outputs.trendDetection?.candidates || [], opportunityCandidates: outputs.opportunityDetection?.candidates || [], confidenceCandidates: outputs.confidenceEvaluation?.candidates || [], feedbackEvents, runId, createdAt: detectedAt });
      markCompleted("semantic_problem_deduplication");
    }

    return { runId, dryRun: options.dryRun !== false, diagnostics, outputs, warnings, completedAt: new Date().toISOString() };
  }

  runWithModularPipeline(input: DiscoveryInput, options: DiscoveryModularPipelineOptions = { enabled: true, dryRun: true }): DiscoveryResult {
    const state = this.produceDiscoveryResult(
      this.prepareDecisionContext(
        this.evaluateConfidence(
          this.consolidateKnowledge(this.buildKnowledgeUpdates(this.normalizeEvidence(this.collectEvidence(this.createState(input)))))
        )
      )
    );
    const modularPipeline = options.enabled === false ? null : this.executeModularPipeline(state, options);
    const finalState = { ...state, modularPipeline, result: state.result ? { ...state.result, modularPipeline: modularPipeline || undefined, metrics: { ...state.result.metrics, modularStageCount: modularPipeline?.diagnostics.length, skippedModularStageCount: modularPipeline?.diagnostics.filter((diagnostic) => diagnostic.status === "skipped").length }, warnings: [...state.result.warnings, ...(modularPipeline?.warnings || [])] } : null };
    const validation = validateDiscoveryState(finalState);

    if (!validation.valid || !finalState.result) {
      throw new Error(`Invalid discovery pipeline state: ${validation.errors.join(" ")}`);
    }

    return finalState.result;
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
      modularStageCount: state.modularPipeline?.diagnostics.length,
      skippedModularStageCount: state.modularPipeline?.diagnostics.filter((diagnostic) => diagnostic.status === "skipped").length,
    };
  }
}
