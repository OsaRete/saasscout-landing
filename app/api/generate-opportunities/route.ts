import OpenAI from "openai";
import { NextResponse } from "next/server";

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://trysaasscout.com",
    "X-Title": "SaaSScout",
  },
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanJsonResponse(content: string) {
  return content.replace(/```json/g, "").replace(/```/g, "").trim();
}

type RawOpportunity = {
  title?: string;
  score?: number | string;
  pain?: string;
  customer?: string;
  target_customer?: string;
  mvp?: string;
  pricing?: string;
  difficulty?: string;
  problem_summary?: string;
  mvp_roadmap?: string;
  validation_questions?: string;
  landing_page_idea?: string;
  acquisition_channels?: string;
};

function normalizeOpportunities(rawOpportunities: RawOpportunity[]) {
  return rawOpportunities.slice(0, 3).map((item, index) => ({
    title: item.title || `SaaS Opportunity ${index + 1}`,
    score: Number(item.score) || 7,
    pain: item.pain || "A repeated pain point was detected in this market.",
    customer: item.customer || item.target_customer || "Not specified",
    mvp: item.mvp || "Build a focused MVP that solves the main repeated problem.",
    pricing: item.pricing || "$19/mo",
    difficulty: item.difficulty || "Medium",
    problem_summary:
      item.problem_summary ||
      item.pain ||
      "Users show repeated frustration around this workflow.",
    target_customer: item.target_customer || item.customer || "Not specified",
    mvp_roadmap:
      item.mvp_roadmap ||
      "1. Validate the problem | 2. Build the core workflow | 3. Test with early users",
    validation_questions:
      item.validation_questions ||
      "How often do users face this problem? | Are they currently paying for alternatives? | What workflow do they use today?",
    landing_page_idea:
      item.landing_page_idea ||
      "A simple landing page focused on saving time and reducing manual work.",
    acquisition_channels:
      item.acquisition_channels ||
      "Reddit communities | LinkedIn outreach | Founder communities",
  }));
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is missing.");
    }

    const body = await req.json();

    const market = String(body.market || "").trim();
    const audience = String(body.audience || "").trim();
    const region = String(body.region || "").trim();
    const evidence = String(body.evidence || "").trim();

    if (!market && !evidence) {
      return NextResponse.json(
        {
          success: false,
          error: "Market or evidence is required.",
        },
        { status: 400 }
      );
    }

    const prompt = `
You are SaaSScout, an AI SaaS opportunity analyst.

Your job is to generate practical SaaS business opportunities from market evidence.

Market:
${market || "Not specified"}

Target audience:
${audience || "Not specified"}

Region:
${region || "Global"}

Evidence:
${evidence || "No evidence provided."}

Generate exactly 3 SaaS opportunities.

Rules:
- Focus on real, practical SaaS products.
- Each opportunity must solve a specific repeated pain point.
- Avoid generic ideas.
- Make the MVP simple and buildable.
- Pricing must be realistic.
- Score must be from 1 to 10.
- Difficulty must be one of: Easy, Medium, Hard.
- Return ONLY valid JSON.
- Do not include markdown.
- Do not include explanations outside JSON.

JSON format:
{
  "opportunities": [
    {
      "title": "CRM for Freelance Designers",
      "score": 8.4,
      "pain": "Freelance designers struggle to manage leads, follow-ups, proposals, and client communication across scattered tools.",
      "customer": "Freelance designers and small design studios",
      "mvp": "A simple CRM with lead tracking, proposal status, follow-up reminders, and client notes.",
      "pricing": "$19/mo",
      "difficulty": "Medium",
      "problem_summary": "Designers lose time and revenue because client management is fragmented.",
      "target_customer": "Solo freelance designers earning revenue from client projects",
      "mvp_roadmap": "1. Lead pipeline | 2. Client notes | 3. Follow-up reminders | 4. Proposal tracking",
      "validation_questions": "How do you currently track leads? | How often do you forget follow-ups? | Would you pay for a simple client workflow tool?",
      "landing_page_idea": "Never lose a design client again. Track leads, proposals, and follow-ups in one simple workspace.",
      "acquisition_channels": "Design communities | LinkedIn outreach | Reddit | Freelance newsletters"
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
            "You generate SaaS opportunity ideas from market pain evidence. Always return valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.35,
      max_tokens: 2200,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error("No AI response generated.");
    }

    let parsed;

    try {
      parsed = JSON.parse(cleanJsonResponse(content));
    } catch {
      console.error("Raw opportunities AI response:", content);
      throw new Error("AI response was not valid JSON.");
    }

    const opportunities = normalizeOpportunities(parsed.opportunities || []);

    return NextResponse.json({
      success: true,
      opportunities,
    });
  } catch (error) {
    console.error("Generate opportunities error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Could not generate opportunities.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}