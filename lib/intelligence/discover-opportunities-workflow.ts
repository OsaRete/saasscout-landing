import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import {
  cleanJsonResponse,
  normalizeProblems,
} from "@/lib/intelligence/discovery-response-normalization";
import { collectExternalSources } from "@/lib/evidence/sources/discovery-external-sources";
import {
  collectDataMoatSources,
  type DiscoverySource,
} from "@/lib/knowledge/discovery-data-moat-sources";
import { updateProblemIntelligence } from "@/lib/knowledge/problem-intelligence-store";
import { adaptDiscoverySourcesToInput } from "@/lib/intelligence/discovery-source-adapter";
import { DiscoveryOrchestrator } from "@/lib/intelligence/orchestrator";
import { buildDiscoveryOrchestratorDiagnosticMetrics } from "@/lib/intelligence/discovery-orchestrator-diagnostics";
import {
  buildDiscoveryPersistencePlan,
  validateDiscoveryPersistencePlanRows,
  type PlannedDiscoveredProblem,
} from "@/lib/intelligence/discovery-orchestrator-persistence-plan";
import { buildDiscoveryShadowComparisonMetrics } from "@/lib/intelligence/discovery-shadow-comparison";

type Source = DiscoverySource;

export class DiscoverOpportunitiesWorkflowError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DiscoverOpportunitiesWorkflowError";
    this.status = status;
  }
}

function isDiscoveryOrchestratorDiagnosticsEnabled() {
  return process.env.DISCOVERY_ORCHESTRATOR_DIAGNOSTICS === "1";
}

function isDiscoveryOrchestratorAssistedPersistenceEnabled() {
  return process.env.DISCOVERY_ORCHESTRATOR_ASSISTED_PERSISTENCE === "1";
}


function buildLegacyDiscoveredProblemRows({
  problems,
  discoveryId,
  userId,
}: {
  problems: ReturnType<typeof normalizeProblems>;
  discoveryId: string;
  userId: string;
}) {
  return problems.map((problem) => ({
    discovery_id: discoveryId,
    user_id: userId,
    problem_title: problem.problem_title,
    problem_summary: problem.problem_summary,
    affected_niches: problem.affected_niches,
    suggested_solutions: problem.suggested_solutions,
    pain_score: problem.pain_score,
    revenue_score: problem.revenue_score,
    urgency_score: problem.urgency_score,
    trend_score: problem.trend_score,
    buying_signal_score: problem.buying_signal_score,
    frequency_score: problem.frequency_score,
    source_quality_score: problem.source_quality_score,
    opportunity_score: problem.opportunity_score,
    problem_cluster: problem.problem_cluster,
    build_difficulty: problem.build_difficulty,
    source_evidence: problem.source_evidence,
  }));
}

function runDiscoveryOrchestratorDryRun({
  externalSources,
  moatSources,
  mode,
}: {
  externalSources: Source[];
  moatSources: Source[];
  mode: string;
}) {
  const input = adaptDiscoverySourcesToInput({
    externalSources,
    moatSources,
    context: {
      integration: "discover-opportunities",
      mode,
    },
    requestedAt: new Date(),
  });

  return new DiscoveryOrchestrator().runModularPipeline(input, {
    enabled: true,
    dryRun: true,
  });
}

function getSafePersistencePlanMetrics(plan: ReturnType<typeof buildDiscoveryPersistencePlan>) {
  return {
    planned_row_count: plan.diagnostics.planned_row_count,
    valid_row_count: plan.diagnostics.valid_row_count,
    invalid_row_count: plan.diagnostics.invalid_row_count,
    warning_count: plan.diagnostics.warnings.length,
    source_candidate_counts: plan.diagnostics.source_candidate_counts,
  };
}

function buildOrchestratorAssistedDiscoveredProblemRows({
  externalSources,
  moatSources,
  discoveryId,
  userId,
}: {
  externalSources: Source[];
  moatSources: Source[];
  discoveryId: string;
  userId: string;
}): PlannedDiscoveredProblem[] | null {
  if (!isDiscoveryOrchestratorAssistedPersistenceEnabled()) return null;

  try {
    // First controlled step toward replacing legacy prompt-derived persistence with
    // orchestrator-assisted intelligence: the orchestrator remains dry-run only,
    // and its discovered_problems-compatible plan is used only behind an explicit flag.
    const orchestratorResult = runDiscoveryOrchestratorDryRun({
      externalSources,
      moatSources,
      mode: "assisted_persistence_dry_run",
    });
    const plan = buildDiscoveryPersistencePlan(orchestratorResult, { discoveryId, userId });
    const validation = validateDiscoveryPersistencePlanRows(plan.rows);
    const hasInvalidRows = validation.some((result) => !result.valid);

    console.info("Discovery orchestrator assisted persistence metrics:", {
      ...getSafePersistencePlanMetrics(plan),
      selected: plan.rows.length > 0 && !hasInvalidRows,
    });

    if (plan.rows.length === 0 || hasInvalidRows) return null;

    return plan.rows;
  } catch (error) {
    console.warn("Discovery orchestrator assisted persistence failed; falling back to legacy problems:", {
      message: error instanceof Error ? error.message : "Unknown assisted persistence error.",
    });
    return null;
  }
}

function runDiscoveryOrchestratorDiagnostics({
  externalSources,
  moatSources,
  legacyProblems,
}: {
  externalSources: Source[];
  moatSources: Source[];
  legacyProblems: ReturnType<typeof normalizeProblems>;
}) {
  if (!isDiscoveryOrchestratorDiagnosticsEnabled()) return;

  try {
    const result = runDiscoveryOrchestratorDryRun({
      externalSources,
      moatSources,
      mode: "diagnostic_dry_run",
    });

    console.info(
      "Discovery orchestrator diagnostics:",
      buildDiscoveryOrchestratorDiagnosticMetrics(result)
    );

    console.info(
      "Discovery orchestrator shadow comparison:",
      buildDiscoveryShadowComparisonMetrics({
        legacyProblems,
        orchestratorResult: result,
      })
    );

    console.info(
      "Discovery orchestrator persistence plan diagnostics:",
      buildDiscoveryPersistencePlan(result).diagnostics
    );
  } catch (error) {
    console.warn("Discovery orchestrator diagnostics failed:", {
      message: error instanceof Error ? error.message : "Unknown diagnostic error.",
    });
  }
}

function getOpenRouterClient() {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://trysaasscout.com",
      "X-Title": "SaaSScout",
    },
  });
}

function getSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );
}

async function analyzeSignals({
  externalSources,
  moatSources,
}: {
  externalSources: Source[];
  moatSources: Source[];
}) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is missing.");
  }

  const externalText = externalSources
    .map(
      (source, index) => `
External Source ${index + 1}
Type: ${source.source_type}
Category: ${source.category || "General"}
Title: ${source.title}
URL: ${source.url || "No URL"}
Snippet: ${source.snippet || "No snippet"}
Signal score: ${source.signal_score || 0}
`
    )
    .join("\n");

  const moatText = moatSources
    .map(
      (source, index) => `
Data Moat Source ${index + 1}
Category: ${source.category || "Data Moat"}
Title: ${source.title}
Snippet: ${source.snippet || "No snippet"}
Signal score: ${source.signal_score || 0}
`
    )
    .join("\n");

  const prompt = `
You are SaaSScout, an AI SaaS opportunity discovery engine.

You must analyze BOTH:
1. Fresh external market signals.
2. Existing internal data moat signals.

Fresh external signals:
${externalText}

Internal data moat:
${moatText}

Return 5 to 8 monetizable SaaS problems.

Rules:
- Prioritize problems supported by fresh external evidence.
- Use the data moat to strengthen, cluster, or validate problems.
- Do not invent generic SaaS ideas.
- Focus on repeated pain, manual work, spreadsheets, workflow friction, buying intent, and operational inefficiency.
- buying_signal_score means evidence that someone might pay.
- frequency_score means how repeated the problem appears.
- source_quality_score means how useful/concrete the sources are.
- opportunity_score must be 1 to 100.
- problem_cluster should be short, like "Client Operations", "Agency Workflow", "Spreadsheet Automation", "Sales Follow-up".
- affected_niches and suggested_solutions must use " | " separators.
- Return ONLY valid JSON.

JSON format:
{
  "summary": "Short summary.",
  "problems": [
    {
      "problem_title": "Short problem title",
      "problem_summary": "Problem explanation.",
      "affected_niches": "Niche 1 | Niche 2",
      "suggested_solutions": "Solution 1 | Solution 2",
      "pain_score": 8,
      "revenue_score": 8,
      "urgency_score": 7,
      "trend_score": 7,
      "buying_signal_score": 8,
      "frequency_score": 8,
      "source_quality_score": 8,
      "opportunity_score": 82,
      "problem_cluster": "Client Operations",
      "build_difficulty": "Medium",
      "source_evidence": "Evidence summary from external and internal signals."
    }
  ]
}
`;

  const completion = await getOpenRouterClient().chat.completions.create({
    model: "openai/gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: "Return valid JSON only.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.25,
    max_tokens: 3200,
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) throw new Error("No AI response generated.");

  try {
    return JSON.parse(cleanJsonResponse(content));
  } catch {
    console.error("Raw discover AI response:", content);
    throw new Error("AI response was not valid JSON.");
  }
}

export async function discoverOpportunitiesWorkflow(userId: string) {
  const { data: profile, error: profileError } = await getSupabaseAdminClient()
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) throw profileError;

  if (!profile) {
    throw new DiscoverOpportunitiesWorkflowError("User profile not found.", 404);
  }

  const sourcesLimit = Number(profile.external_sources_limit) || 10;

  const externalSources = await collectExternalSources(sourcesLimit);
  const moatSources = await collectDataMoatSources();

  const analysis = await analyzeSignals({
    externalSources,
    moatSources,
  });

  const problems = normalizeProblems(analysis.problems || []);

  runDiscoveryOrchestratorDiagnostics({
    externalSources,
    moatSources,
    legacyProblems: problems,
  });

  const { data: discoveryData, error: discoveryError } = await getSupabaseAdminClient()
    .from("opportunity_discoveries")
    .insert([
      {
        user_id: userId,
        plan: profile.plan || "free",
        sources_limit: sourcesLimit,
        total_sources_analyzed: externalSources.length + moatSources.length,
        summary:
          analysis.summary ||
          "SaaSScout discovered opportunities from live external signals and the internal data moat.",
        status: "completed",
      },
    ])
    .select()
    .single();

  if (discoveryError || !discoveryData) {
    throw discoveryError || new Error("Could not save discovery.");
  }

  const legacyProblemsToInsert = buildLegacyDiscoveredProblemRows({
    problems,
    discoveryId: discoveryData.id,
    userId,
  });
  const orchestratorProblemsToInsert = buildOrchestratorAssistedDiscoveredProblemRows({
    externalSources,
    moatSources,
    discoveryId: discoveryData.id,
    userId,
  });
  let problemsToInsert = orchestratorProblemsToInsert || legacyProblemsToInsert;

  let { data: insertedProblems, error: problemsError } = await getSupabaseAdminClient()
    .from("discovered_problems")
    .insert(problemsToInsert)
    .select();

  if (problemsError && orchestratorProblemsToInsert) {
    console.warn("Discovery orchestrator assisted persistence insert failed; retrying legacy problems:", {
      message: problemsError instanceof Error ? problemsError.message : "Unknown discovered_problems insert error.",
    });
    problemsToInsert = legacyProblemsToInsert;
    const legacyInsert = await getSupabaseAdminClient()
      .from("discovered_problems")
      .insert(problemsToInsert)
      .select();
    insertedProblems = legacyInsert.data;
    problemsError = legacyInsert.error;
  }

  if (problemsError) throw problemsError;

  for (const problem of problemsToInsert) {
    await updateProblemIntelligence(problem);
  }

  return {
    success: true,
    discovery: discoveryData,
    problems: insertedProblems || [],
    external_sources_analyzed: externalSources.length,
    data_moat_sources_used: moatSources.length,
  };
}
