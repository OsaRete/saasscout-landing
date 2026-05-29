import OpenAI from "openai";

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "SaaSScout",
  },
});

function cleanJsonResponse(content: string) {
  return content
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
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

    const market = String(body.market || "").trim();
    const audience = String(body.audience || "").trim();
    const region = String(body.region || "").trim();
    const evidence = String(body.evidence || "").trim();

    if (!market) {
      return Response.json({ error: "Market is required." }, { status: 400 });
    }

    const limitedMarket = market.slice(0, 120);
    const limitedAudience = audience.slice(0, 120);
    const limitedRegion = region.slice(0, 80);
    const limitedEvidence = evidence.slice(0, 6000);

    const prompt = `
You are SaaSScout, an AI market opportunity analyst.

Analyze the market and generate exactly 3 SaaS product opportunities.

Market: ${limitedMarket}
Audience: ${limitedAudience || "Not specified"}
Region: ${limitedRegion || "Global"}

User-provided evidence:
${limitedEvidence || "No user-provided evidence."}

Rules:
- Focus on practical SaaS businesses.
- Avoid generic startup ideas.
- Make the pain specific and realistic.
- If evidence is provided, prioritize repeated problems, complaints, workflows, frustrations, and unmet needs found in the evidence.
- If evidence is provided, make the opportunities feel grounded in that evidence.
- If evidence is not provided, infer reasonable opportunities from the market, audience, and region.
- Problem Summary should be 3 to 5 sentences.
- Target Customer should describe who pays, their context, and why they would care.
- MVP Roadmap should contain 3 implementation phases.
- Validation Questions should contain at least 5 customer interview questions separated by " | ".
- Landing Page Idea should contain a headline, subheadline, and CTA.
- Acquisition Channels should contain 4 to 6 realistic channels separated by commas.
- Keep answers concise but actionable.
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
      "mvp": "3 to 5 MVP features separated by commas",
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
            "You generate practical SaaS opportunities from market pain and user-provided evidence. Always respond with valid JSON only.",
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

    let parsed;

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
      ? parsed.opportunities.slice(0, 3)
      : [];
    console.log("AI generation opportunities:", opportunities);

    return Response.json({ opportunities });
  } catch (error) {
    console.error("Generate opportunities error:", error);

    return Response.json(
      { error: "Failed to generate opportunities." },
      { status: 500 }
    );
  }
}