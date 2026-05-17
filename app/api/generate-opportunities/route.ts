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

    if (!market) {
      return Response.json({ error: "Market is required." }, { status: 400 });
    }

    const limitedMarket = market.slice(0, 120);
    const limitedAudience = audience.slice(0, 120);
    const limitedRegion = region.slice(0, 80);

    const prompt = `
You are SaaSScout, an AI market opportunity analyst.

Analyze this market and generate exactly 3 SaaS product opportunities.

Market: ${limitedMarket}
Audience: ${limitedAudience || "Not specified"}
Region: ${limitedRegion || "Global"}

Rules:
- Focus on practical SaaS ideas that can become MVPs.
- Avoid generic ideas.
- Make the pain specific.
- Keep each field concise.
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
      "difficulty": "Low"
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
            "You generate practical SaaS opportunities from market pain. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.35,
      max_tokens: 1000,
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

    return Response.json({ opportunities });
  } catch (error) {
    console.error("Generate opportunities error:", error);

    return Response.json(
      { error: "Failed to generate opportunities." },
      { status: 500 }
    );
  }
}