import { appendFileSync } from "node:fs";
import { createScanArtifactFixtureDependencies } from "../scan-artifact-fixture.ts";

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
    return completion(JSON.stringify({ summary: "Disposable Discovery result", problems: [] }));
  }
  const evidenceId = prompt?.match(/\b(?:pasted-evidence|uploaded-txt)-\d{3}\b/)?.[0];
  const stage = system?.startsWith("You analyze evidence and return structured SaaS market intelligence.")
    ? "problem"
    : system === "You produce evidence-grounded Solution Intelligence as strict JSON only." ? "solution" : null;
  if (!stage || !evidenceId || body.model !== "openai/gpt-4.1-mini") return;

  appendFileSync(process.env.BETA_ACCEPTANCE_PROVIDER_LOG, `${stage}\n`);
  if (stage === "problem" && prompt.includes("Fixture provider failure")) {
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
