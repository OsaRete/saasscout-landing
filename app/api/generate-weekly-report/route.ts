import { NextResponse } from "next/server";

const TRENDING_NICHES = [
  "Fitness coaches",
  "Freelance designers",
  "Real estate agents",
  "Local restaurants",
  "Online tutors",
  "Indie SaaS founders",
  "Book authors",
  "Wedding planners",
  "Small marketing agencies",
  "E-commerce store owners",
];

function getWeekRange() {
  const now = new Date();

  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
  };
}

function generateMockNicheData(niche: string, index: number) {
  const trendScore = Number((9.2 - index * 0.35).toFixed(1));
  const painIntensity = Number((8.8 - index * 0.25).toFixed(1));
  const sourceVolume = 35 - index * 2;

  return {
    niche,
    category: "Market segment",
    trend_score: trendScore,
    pain_intensity: painIntensity,
    source_volume: sourceVolume,
    repeated_problems:
      "Manual workflows | Fragmented tools | Poor follow-up | Time-consuming admin tasks",
    opportunity_angle: `Build an automation-first SaaS tool for ${niche.toLowerCase()} focused on reducing repetitive operational work.`,
    movement: index < 3 ? "+ Rising" : index < 7 ? "Stable" : "- Cooling",
  };
}

export async function POST() {
  try {
    const { weekStart, weekEnd } = getWeekRange();

    const niches = TRENDING_NICHES.map((niche, index) =>
      generateMockNicheData(niche, index)
    );

    const averageTrendScore =
      niches.reduce((sum, item) => sum + item.trend_score, 0) / niches.length;

    const averagePainIntensity =
      niches.reduce((sum, item) => sum + item.pain_intensity, 0) /
      niches.length;

    return NextResponse.json({
      success: true,
      report: {
        week_start: weekStart,
        week_end: weekEnd,
        summary:
          "This week shows strong demand around automation, admin reduction, client management, and workflow consolidation across service-based niches.",
        strongest_trend: niches[0].niche,
        total_sources_analyzed: niches.reduce(
          (sum, item) => sum + item.source_volume,
          0
        ),
        average_trend_score: Number(averageTrendScore.toFixed(1)),
        average_pain_intensity: Number(averagePainIntensity.toFixed(1)),
        niches,
      },
    });
  } catch (error) {
    console.error("Generate weekly report error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Could not generate weekly report.",
      },
      { status: 500 }
    );
  }
}