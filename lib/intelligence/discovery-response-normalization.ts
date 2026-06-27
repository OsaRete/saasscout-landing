export type DiscoveredProblem = {
  problem_title: string;
  problem_summary: string;
  affected_niches: string;
  suggested_solutions: string;
  pain_score: number;
  revenue_score: number;
  urgency_score: number;
  trend_score: number;
  buying_signal_score: number;
  frequency_score: number;
  source_quality_score: number;
  opportunity_score: number;
  problem_cluster: string;
  build_difficulty: string;
  source_evidence: string;
};

export function cleanJsonResponse(content: string) {
  return content.replace(/```json/g, "").replace(/```/g, "").trim();
}

export function clampScore(value: unknown, fallback = 7, min = 1, max = 10) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.min(max, Math.max(min, score));
}

export function normalizeProblems(rawProblems: DiscoveredProblem[]) {
  return rawProblems.slice(0, 8).map((item, index) => ({
    problem_title: item.problem_title || `Market Problem ${index + 1}`,
    problem_summary:
      item.problem_summary ||
      "A repeated market problem was detected from external and internal signals.",
    affected_niches:
      item.affected_niches ||
      "Small businesses | Solo founders | Service providers",
    suggested_solutions:
      item.suggested_solutions ||
      "Workflow automation tool | Lightweight operating system | AI assistant",
    pain_score: clampScore(item.pain_score),
    revenue_score: clampScore(item.revenue_score),
    urgency_score: clampScore(item.urgency_score),
    trend_score: clampScore(item.trend_score),
    buying_signal_score: clampScore(item.buying_signal_score),
    frequency_score: clampScore(item.frequency_score),
    source_quality_score: clampScore(item.source_quality_score),
    opportunity_score: Math.min(100, Math.max(1, Number(item.opportunity_score || 70))),
    problem_cluster: item.problem_cluster || "General Workflow",
    build_difficulty: ["Easy", "Medium", "Hard"].includes(item.build_difficulty)
      ? item.build_difficulty
      : "Medium",
    source_evidence:
      item.source_evidence ||
      "External and internal signals suggest repeated workflow friction.",
  }));
}
