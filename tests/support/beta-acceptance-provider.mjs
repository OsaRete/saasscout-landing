import { appendFileSync, existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { createScanArtifactFixtureDependencies } from "../scan-artifact-fixture.ts";

let discoveryRuns = 0;
let scanFailureAttempts = 0;
const fixture = createScanArtifactFixtureDependencies();
export async function mockAcceptanceProvider(url, init) {
  if (url.origin === "https://serpapi.com" && url.pathname === "/search.json" &&
      init?.method === "GET" && url.searchParams.get("api_key") === "disposable-transport-trap") {
    appendFileSync(process.env.BETA_ACCEPTANCE_PROVIDER_LOG, "search\n");
    return Response.json({ organic_results: [{
      title: "Disposable reporting source", link: "https://example.test/reporting",
      snippet: "Operators report manually copying spreadsheet data every week.",
    }] });
  }
  if (url.href !== "https://openrouter.ai/api/v1/chat/completions" || init?.method !== "POST") return;
  const body = JSON.parse(init.body);
  const system = body.messages?.[0]?.content;
  const prompt = body.messages?.[1]?.content;
  if (body.model === "openai/gpt-4.1-mini" && system === "Return valid JSON only." &&
      prompt?.includes("You are SaaSScout, an AI SaaS opportunity discovery engine.")) {
    if (!prompt.includes("Disposable reporting source")) return;
    const stage = prompt.includes("Return 5 to 8 monetizable SaaS problems.") ? "initial" : "replacement";
    appendFileSync(process.env.BETA_ACCEPTANCE_PROVIDER_LOG, `discovery-${stage}\n`);
    if (stage === "initial") discoveryRuns += 1;
    if (discoveryRuns === 3) {
      return Response.json({ error: { message: "Disposable Discovery upstream failure" } }, { status: 502 });
    }
    const problems = discoveryRuns === 2 && stage === "replacement" ? [{
      problem_title: "Spreadsheet reconciliation for agency reports",
      problem_summary: "Agency operators copy and reconcile spreadsheet metrics by hand before sending weekly client reports.",
      affected_niches: "Reporting agencies", suggested_solutions: "Automated spreadsheet reconciliation",
      pain_score: 8, revenue_score: 7, urgency_score: 7, trend_score: 7,
      buying_signal_score: 7, frequency_score: 8, source_quality_score: 8, opportunity_score: 82,
      problem_cluster: "Client Operations", build_difficulty: "Medium",
      source_evidence: "Disposable reporting source describes manually copying spreadsheet data every week.",
    }] : [];
    return completion(JSON.stringify({ summary: discoveryRuns === 4 ? "Disposable Discovery write rejection" : "Disposable Discovery result", problems }));
  }
  if (body.model === "openai/gpt-4.1-mini" && system === "Return valid JSON only. Never fabricate user evidence." &&
      prompt?.includes("Weekly closure fixture evidence")) {
    const corrective = prompt.includes("Corrective regeneration instruction:");
    appendFileSync(process.env.BETA_ACCEPTANCE_PROVIDER_LOG, corrective ? "weekly-corrective\n" : "weekly-initial\n");
    return completion(JSON.stringify(corrective
      ? { summary: "Weekly closure fixture grounded report", problems: [] }
      : { problems: [] }));
  }
  const evidenceId = prompt?.match(/\b(?:pasted-evidence|uploaded-txt)-\d{3}\b/)?.[0];
  const stage = system?.startsWith("You analyze evidence and return structured SaaS market intelligence.")
    ? "problem"
    : system === "You produce evidence-grounded Solution Intelligence as strict JSON only." ? "solution" : null;
  if (!stage || !evidenceId || body.model !== "openai/gpt-4.1-mini") return;

  appendFileSync(process.env.BETA_ACCEPTANCE_PROVIDER_LOG, `${stage}\n`);
  if (stage === "problem" && prompt.includes("Agency reporting acceptance")) {
    const release = `${process.env.BETA_ACCEPTANCE_PROVIDER_LOG}.release-scan`;
    for (let i = 0; !existsSync(release); i += 1) {
      if (i === 300) throw new Error("Disposable Scan release was not signaled");
      await delay(50);
    }
  }
  if (stage === "problem" && prompt.includes("Fixture provider failure")) {
    if (prompt.includes("Simulate connection loss") && ++scanFailureAttempts === 2) {
      throw new TypeError("Disposable connection lost after dispatch");
    }
    return Response.json({ error: { message: "Disposable upstream failure" } }, { status: 502 });
  }
  const input = { allowedEvidenceIds: [evidenceId] };
  const content = stage === "problem"
    ? await fixture.generateProblemModelOutput(input)
    : await fixture.generateSolutionModelOutput(input);
  return completion(content);
}

function completion(content) {
  return Response.json({ choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }] });
}
