import OpenAI from "openai";
import { AuthError, requireUser } from "../_utils/auth";

function getOpenRouterClient() {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
      "X-Title": "SaaSScout",
    },
  });
}

function cleanJsonResponse(content: string) {
  return content
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

function safeString(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

export async function POST(request: Request) {
  try {
    await requireUser(request);

    if (!process.env.OPENROUTER_API_KEY) {
      return Response.json(
        { error: "OpenRouter API key is missing." },
        { status: 500 }
      );
    }

    const body = await request.json();

    const market = safeString(body.market).slice(0, 120);
    const audience = safeString(body.audience).slice(0, 120);
    const region = safeString(body.region).slice(0, 80);
    const evidence = safeString(body.evidence).slice(0, 6000);

    if (!market && !evidence) {
      return Response.json(
        { error: "Market or evidence is required." },
        { status: 400 }
      );
    }

    const prompt = `
You are SaaSScout Evidence Intelligence.

Analyze the provided market evidence and extract structured business intelligence for SaaS opportunity discovery.

Inputs:
Market:
${market || "Infer from evidence."}

Audience:
${audience || "Infer from evidence."}

Region:
${region || "Global"}

Evidence:
${evidence || "No user-provided evidence."}

Your job:
- Infer the real market if not provided.
- Identify who likely has the problem.
- Extract pain points, repeated patterns, workflows, objections, and willingness-to-pay signals.
- Convert messy evidence into clear opportunity intelligence.
- Be concise, practical, and specific.
- Do not invent unsupported facts. If something is inferred, make it reasonable.

Return ONLY valid JSON.
Do not include markdown.
Do not include explanations outside JSON.

JSON format:
{
  "inferred_market": "specific market or niche",
  "audience_summary": "who the evidence seems to describe",
  "evidence_summary": "short summary of what the evidence says",
  "pain_points": "3 to 6 pain points separated by |",
  "repeated_patterns": "repeated behaviors, complaints or workflows separated by |",
  "workflow_problems": "manual or broken workflows separated by |",
  "willingness_to_pay_signals": "signals that suggest people may pay, or 'No clear willingness-to-pay signals found'",
  "opportunity_angles": "4 to 6 SaaS opportunity angles separated by |",
  "confidence_score": 8.2
}
`;

    const completion = await getOpenRouterClient().chat.completions.create({
      model: "openai/gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You analyze evidence and return structured SaaS market intelligence as valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.25,
      max_tokens: 1200,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return Response.json(
        { error: "No evidence analysis generated." },
        { status: 500 }
      );
    }

    let parsed;

    try {
      parsed = JSON.parse(cleanJsonResponse(content));
    } catch {
      return Response.json(
        {
          error: "Evidence analysis was not valid JSON.",
          raw: content,
        },
        { status: 500 }
      );
    }

    return Response.json({
      analysis: {
        inferred_market: safeString(parsed.inferred_market, market || "Unknown"),
        audience_summary: safeString(parsed.audience_summary, audience || ""),
        evidence_summary: safeString(parsed.evidence_summary),
        pain_points: safeString(parsed.pain_points),
        repeated_patterns: safeString(parsed.repeated_patterns),
        workflow_problems: safeString(parsed.workflow_problems),
        willingness_to_pay_signals: safeString(
          parsed.willingness_to_pay_signals
        ),
        opportunity_angles: safeString(parsed.opportunity_angles),
        confidence_score: Number(parsed.confidence_score) || 7,
      },
    });
  } catch (error) {
    console.error("Analyze evidence error:", error);

    if (error instanceof AuthError) {
      return Response.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to analyze evidence.";

    return Response.json({ error: message }, { status: 500 });
  }
}
