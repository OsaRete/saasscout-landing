/** Pure domain contracts for real-world Idea Validation. They are not persistence schemas. */
export type ValidationSubjectOrigin = "discover" | "scan" | "weekly" | "saved_idea" | "opportunity" | "user_entered";
export type UpstreamReference = Readonly<{ origin: Exclude<ValidationSubjectOrigin, "user_entered">; referenceId: string; version?: string }>;
export type ValidationSubject = Readonly<{ subjectRef: string; ownerScopeRef: string; origin: ValidationSubjectOrigin; upstream?: UpstreamReference; contextSnapshot: Readonly<{ label: string; description?: string }>; createdAt: string; status: "active" | "superseded" | "archived" }>;

export type HypothesisStatus = "draft" | "active" | "superseded" | "retired";
export type HypothesisDraft = Readonly<{
  targetSegment: string; problemClaim: string; expectedObservableBehavior: string; commercialAssumption?: string;
  supportCriteria: readonly string[]; contradictionCriteria: readonly string[]; inconclusiveCriteria: readonly string[];
  scope: Readonly<{ included: readonly string[]; excluded: readonly string[] }>;
}>;
export type Hypothesis = HypothesisDraft & Readonly<{ hypothesisRef: string; subjectRef: string; version: number; status: HypothesisStatus }>;

export type ExperimentFamily = "customer_interview" | "survey" | "landing_waitlist" | "social_validation_post";
export type ExperimentLifecycle = "draft" | "ready" | "running" | "paused" | "completed" | "cancelled";
export type ExperimentVisibility = "visible" | "archived";
export type ExperimentDraft = Readonly<{ family: ExperimentFamily; targetAudience: readonly string[]; questionSet: readonly string[]; screeningCriteria: readonly string[]; collectionMethod: string; cta?: string; pricing?: string }>;
export type Experiment = ExperimentDraft & Readonly<{ experimentRef: string; hypothesisRef: string; hypothesisVersion: number; version: number; lifecycle: ExperimentLifecycle; visibility: ExperimentVisibility }>;

/** Identity is deliberately indirect: broad evidence contracts never require a name or email. */
export type ParticipantIdentityMode = "anonymous" | "experiment_pseudonymous" | "owner_pseudonymous" | "identified_interview" | "email_waitlist_lead" | "social_source" | "manual_imported";
export type ParticipantReference = Readonly<{ participantRef?: string; identityMode: ParticipantIdentityMode; protectedContactRef?: string; consent?: Readonly<{ purpose: string; capturedAt?: string; mode: "not_required" | "acknowledged" | "explicit" }> }>;
export type AttributionSource = "participant_supplied" | "user_supplied" | "deterministic_system_derived" | "ai_model_suggested" | "server_observed";
export type RelevanceFactor = "target_segment_match" | "direct_experience" | "role_relevance" | "company_context_relevance" | "problem_exposure" | "frequency" | "current_workaround" | "commercial_exposure";
export type ParticipantRelevanceInput = Readonly<{ factor: RelevanceFactor; value: "yes" | "no" | "unknown" | string; attributedBy: AttributionSource; note?: string }>;

export type HumanEvidenceOrigin = "human_response" | "human_interview" | "survey_response" | "social_response" | "manual_human_observation";
export type BehavioralEvidenceOrigin = "behavioral_observation";
export type UpstreamContextOrigin = "discover_context" | "scan_context" | "weekly_context" | "saved_idea_context" | "opportunity_context" | "snapshot_context" | "evidence_alignment_context";
export type DerivedInterpretationOrigin = "deterministic_interpretation" | "ai_model_interpretation";
export type EvidenceOrigin = HumanEvidenceOrigin | BehavioralEvidenceOrigin | UpstreamContextOrigin | DerivedInterpretationOrigin;
export type EvidenceModality = "opinion" | "reported_behavior" | "observed_behavior" | "commercial_signal" | "structured_response" | "free_text_response" | "interview_observation" | "survey_answer" | "social_response" | "conversion_event";
export type EvidencePolarity = "supporting" | "contradicting" | "mixed" | "neutral" | "inconclusive";
export type Sentiment = "positive" | "negative" | "mixed" | "neutral";
export type BehavioralEventType = "page_view" | "cta_click" | "form_started" | "signup_submitted" | "demo_requested" | "pricing_interaction" | "deposit_completed" | "purchase_completed";
export type ClassificationProvenance = Readonly<{ attributedBy: AttributionSource; classifiedAt: string; rationale?: string; supersedesClassificationRef?: string }>;
export type SourceProvenance = Readonly<{ sourceType: string; sourceReference?: string; collectedBy: "manual" | "import" | "server_observed"; boundedPayload?: Readonly<Record<string, string | number | boolean | null>> }>;
export type ObservationIndependence = Readonly<{ contentFingerprint?: string; ingestionIdempotencyKey?: string; participantIndependenceKey?: string; relationship: "unknown" | "independent" | "duplicate" | "repeat_participant"; anonymousIndependenceUncertain: boolean }>;
/** Raw/source fields are immutable. Corrections append a classification that supersedes an earlier classification; they never rewrite raw evidence. */
export type ValidationObservation = Readonly<{ observationRef: string; subjectRef: string; hypothesisRef: string; hypothesisVersion: number; experimentRef: string; experimentVersion: number; participant: ParticipantReference; participantRelevance: readonly ParticipantRelevanceInput[]; origin: HumanEvidenceOrigin | BehavioralEvidenceOrigin; modality: EvidenceModality; behavioralEvent?: BehavioralEventType; observedAt: string; collectedAt: string; source: SourceProvenance; normalizedObservation: string; sentiment?: Sentiment; polarity: EvidencePolarity; commercialSignal?: Readonly<{ kind: "stated_price" | "deposit" | "purchase" | "demo_request"; amount?: number; currency?: string }>; independence: ObservationIndependence; classification: ClassificationProvenance }>;

export type InterpretationKind = "themes" | "suggested_polarity" | "segment_relevance_suggestion" | "summary" | "contradiction_explanation" | "next_experiment_recommendation" | "validation_narrative";
export type DerivedInterpretation = Readonly<{ interpretationRef: string; kind: InterpretationKind; origin: DerivedInterpretationOrigin; evidenceRefs: readonly string[]; content: string; createdAt: string; modelRef?: string; approvedByUser?: boolean }>;
export type ValidationDimension = "problem_evidence" | "target_segment_relevance" | "problem_frequency_severity" | "current_workaround_evidence" | "solution_interest" | "behavioral_intent" | "commercial_evidence" | "willingness_to_pay" | "contradiction_strength" | "evidence_coverage_limitations";
export type ValidationEvidenceState = "insufficient" | "limited" | "mixed" | "moderate" | "strong" | "contradicted";
export type OverallNarrativeState = "insufficient_evidence" | "problem_signal_emerging" | "mixed_or_segment_dependent" | "promising_behavioral_evidence_incomplete" | "promising_commercial_evidence_incomplete" | "materially_contradicted" | "ready_for_next_stage_commitment_review";

export type QuestionIntent = "problem_discovery" | "past_behavior" | "frequency_severity" | "current_workaround" | "commercial_exposure" | "contradiction_probe" | "screening";
export type ConsentPrivacyMode = "anonymous_notes" | "pseudonymous_notes" | "identified_with_explicit_consent";
export type InterviewQuestion = Readonly<{ questionRef: string; prompt: string; intent: QuestionIntent; biasRisks?: readonly ("leading" | "hypothetical" | "double_barreled")[] }>;
export type CustomerInterviewDesign = Readonly<{ family: "customer_interview"; hypothesis: Hypothesis; targetParticipantCriteria: readonly string[]; questions: readonly InterviewQuestion[]; consentPrivacyMode: ConsentPrivacyMode; captureMode: "manual_observation" }>;
export type SurveyQuestionType = "single_choice" | "multiple_choice" | "short_text" | "long_text" | "number";
export type SurveyQuestion = Readonly<{ questionRef: string; prompt: string; type: SurveyQuestionType; required: boolean; options?: readonly string[]; min?: number; max?: number }>;
export type SurveyDesign = Readonly<{ family: "survey"; hypothesis: Hypothesis; targetRespondentCriteria: readonly string[]; questions: readonly SurveyQuestion[]; responseSource: "public_link" }>;

export type ValidationDomainErrorCode = "invalid_hypothesis" | "untestable_hypothesis" | "invalid_lifecycle_transition" | "material_change_requires_new_version" | "invalid_evidence_origin" | "invalid_evidence_classification" | "invalid_experiment_design";
export type ValidationDomainError = Readonly<{ code: ValidationDomainErrorCode; field?: string; message: string }>;
export type ValidationResult<T = undefined> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; errors: readonly ValidationDomainError[] }>;
