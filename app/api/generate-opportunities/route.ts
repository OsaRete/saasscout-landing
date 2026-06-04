import OpenAI from "openai";

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    "X-Title": "SaaSScout",
  },
});

type Opportunity = {
  title?: string;
  score?: number;
  pain?: string;
  customer?: string;
  mvp?: string;
  pricing?: string;
  difficulty?: string;
  problem_summary?: string;
  target_customer?: string;
  mvp_roadmap?: string;
  validation_questions?: string;
  landing_page_idea?: string;
  acquisition_channels?: string;
};

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

function safeNumber(value: unknown, fallback = 7) {
  const number = Number(value);

  if (!Number.isFinite(number)) return fallback;

  if (number < 0) return 0;
  if (number > 10) return 10;

  return Number(number.toFixed(1));
}

function normalizeOpportunity(opportunity: Opportunity) {
  return {
    title: safeString(opportunity.title, "Untitled opportunity"),
    score: safeNumber(opportunity.score, 7),
    pain: safeString(opportunity.pain, "No pain point provided."),
    customer: safeString(opportunity.customer, "Not specified."),
    mvp: safeString(opportunity.mvp, "Not specified."),
    pricing: safeString(opportunity.pricing, "Not specified."),
    difficulty: safeString(opportunity.difficulty, "Medium"),

    problem_summary: safeString(
      opportunity.problem_summary,
      safeString(opportunity.pain, "No problem summary provided.")
    ),
    target_customer: safeString(
      opportunity.target_customer,
      safeString(opportunity.customer, "Not specified.")
    ),
    mvp_roadmap: safeString(
      opportunity.mvp_roadmap,
      "Phase 1: Validate the problem. Phase 2: Build the core workflow. Phase 3: Launch a paid beta."
    ),
    validation_questions: safeString(
      opportunity.validation_questions,
      "How do you solve this today? | How often does this happen? | What happens if you ignore it? | Have you paid for a solution before? | Would you pay for this?"
    ),
    landing_page_idea: safeString(
      opportunity.landing_page_idea,
      "Headline: Solve the painful workflow faster. Subheadline: Turn manual work into a simple automated process. CTA: Join the beta."
    ),
    acquisition_channels: safeString(
      opportunity.acquisition_channels,
      "SEO, LinkedIn, Reddit, Niche communities"
    ),
  };
}

export async function POST(request: Request) {
  try {
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
        { error: "Please provide a market or evidence." },
        { status: 400 }
      );
    }

    const prompt = `
You are SaaSScout, an AI market opportunity analyst.

Your task:
Generate exactly 3 practical SaaS product opportunities.

Inputs:
Market:
${market || "Infer the market from the evidence."}

Audience:
${audience || "Infer the audience from the market and evidence."}

Region:
${region || "Global"}

Evidence:
${evidence || "No user-provided evidence."}

Important behavior:
- If the market is missing, infer it from the evidence.
- If the audience is missing, infer the likely paying customer.
- If evidence is provided, prioritize repeated problems, complaints, workflows, frustrations, and unmet needs found in the evidence.
- If evidence is provided, make the opportunities clearly grounded in that evidence.
- If evidence is not provided, infer reasonable opportunities from the market, audience, and region.
- Avoid generic ideas.
- Focus on realistic SaaS businesses that could become MVPs.

Field requirements:
- title: short SaaS product name.
- score: number from 0 to 10.
- pain: one clear sentence describing the customer pain.
- customer: concise ideal customer profile.
- mvp: 3 to 5 MVP features separated by commas.
- pricing: realistic monthly price like "$19/mo".
- difficulty: "Low", "Medium", or "High".
- problem_summary: 3 to 5 sentences explaining the problem and why it matters.
- target_customer: describe who pays, their context, and why they care.
- mvp_roadmap: 3 phases written as "Phase 1: ... Phase 2: ... Phase 3: ..."
- validation_questions: at least 5 customer interview questions separated by " | ".
- landing_page_idea: include "Headline:", "Subheadline:", and "CTA:".
- acquisition_channels: 4 to 6 realistic channels separated by commas.

Output rules:
- Return exactly 3 opportunities.
- Return ONLY valid JSON.
- Do not include markdown.
- Do not include explanations outside JSON.

JSON format:
{
  "opportunities": [
    {
      "title": "short SaaS product name",
      "score": 8.4,
      "pain": "clear customer pain",
      "customer": "ideal customer profile",
      "mvp": "feature 1, feature 2, feature 3",
      "pricing": "$19/mo",
      "difficulty": "Low",
      "problem_summary": "Detailed explanation of the problem and why it matters.",
      "target_customer": "Detailed description of the ideal paying customer.",
      "mvp_roadmap": "Phase 1: ... Phase 2: ... Phase 3: ...",
      "validation_questions": "Question 1? | Question 2? | Question 3? | Question 4? | Question 5?",
      "landing_page_idea": "Headline: ... Subheadline: ... CTA: ...",
      "acquisition_channels": "SEO, LinkedIn, Reddit, Niche communities"
    }
  ]
}
`;

    const completion = await openrouter.chat.completions.create({
      model: "openai/gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You generate practical SaaS opportunities from market pain and evidence. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.35,
      max_tokens: 1800,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return Response.json(
        { error: "No AI response generated." },
        { status: 500 }
      );
    }

    let parsed: { opportunities?: Opportunity[] };

    try {
      parsed = JSON.parse(cleanJsonResponse(content));
    } catch {
      return Response.json(
        {
          error: "AI response was not valid JSON.",
          raw: content,
        },
        { status: 500 }
      );
    }

    const opportunities = Array.isArray(parsed.opportunities)
      ? parsed.opportunities.slice(0, 3).map(normalizeOpportunity)
      : [];

    if (opportunities.length === 0) {
      return Response.json(
        { error: "No opportunities were generated." },
        { status: 500 }
      );
    }

    return Response.json({ opportunities });
  } catch (error) {
    console.error("Generate opportunities error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Failed to generate opportunities.";

    return Response.json({ error: message }, { status: 500 });
  }
}