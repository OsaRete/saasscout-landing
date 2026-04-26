"use client";
import BetaSignupForm from "./BetaSignupForm";

export default function Home() {
  const opportunityFactors = [
    ["Pain Intensity", "9.1"],
    ["Frequency", "8.0"],
    ["Willingness to Pay", "8.5"],
    ["Competition", "6.8"],
    ["Build Simplicity", "8.7"],
    ["Trend Momentum", "7.9"],
  ];

  const examples = [
    {
      score: "8.4",
      title: "CRM for Freelancers",
      description:
        "Manage leads, follow-ups, proposals, and client relationships in one simple place.",
      pricing: "$19/mo",
    },
    {
      score: "7.9",
      title: "Booking Tool for Coaches",
      description:
        "Sessions, reminders, payments, check-ins, and scheduling for online fitness coaches.",
      pricing: "$29/mo",
    },
    {
      score: "7.6",
      title: "Review Insights for Local Businesses",
      description:
        "Turn customer complaints into operational improvements and growth actions.",
      pricing: "$49/mo",
    },
  ];

  return (
    <main className="min-h-screen overflow-hidden bg-[#050816] text-white">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute right-0 top-80 h-[400px] w-[400px] rounded-full bg-cyan-500/10 blur-[100px]" />
      </div>

      {/* Navbar */}
      <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#050816]/80 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <a href="#" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 shadow-lg shadow-violet-600/30">
              <span className="text-sm font-black">S</span>
            </div>
            <span className="text-xl font-bold tracking-tight">SaaSScout</span>
          </a>

          <div className="hidden gap-8 text-sm text-gray-300 md:flex">
            <a href="#how-it-works" className="hover:text-white">
              How it works
            </a>
            <a href="#score" className="hover:text-white">
              Score
            </a>
            <a href="#pricing" className="hover:text-white">
              Pricing
            </a>
          </div>

          <a
            href="#join-beta"
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium shadow-lg shadow-violet-600/30 transition hover:bg-violet-500"
          >
            Join Beta
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto grid max-w-7xl items-center gap-14 px-6 py-24 md:grid-cols-2 md:py-32">
        <div>
          <div className="mb-6 inline-flex rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-300">
            AI Founder Intelligence for indie builders
          </div>

          <h1 className="max-w-3xl text-5xl font-bold leading-tight tracking-tight md:text-7xl">
            Find SaaS ideas hidden in real market complaints.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-400">
            SaaSScout analyzes public conversations from Reddit and X to uncover
            painful problems, rank opportunities, and suggest MVP ideas for
            founders who want to build from real demand.
          </p>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <a
              href="#join-beta"
              className="rounded-xl bg-violet-600 px-6 py-3 text-center font-semibold shadow-xl shadow-violet-600/30 transition hover:bg-violet-500"
            >
              Join Beta
            </a>

            <button
              onClick={() => alert("Coming soon")}
              className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-gray-200 transition hover:bg-white/10"
            >
              View Demo
            </button>
          </div>

          <div className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-white/10 pt-6">
            <div>
              <p className="text-2xl font-bold">5–10</p>
              <p className="text-sm text-gray-500">ranked ideas per search</p>
            </div>
            <div>
              <p className="text-2xl font-bold">6</p>
              <p className="text-sm text-gray-500">scoring signals</p>
            </div>
            <div>
              <p className="text-2xl font-bold">24/7</p>
              <p className="text-sm text-gray-500">market monitoring vision</p>
            </div>
          </div>
        </div>

        {/* Product Mockup */}
        <div className="relative">
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-violet-600 to-cyan-400 opacity-30 blur-2xl" />

          <div className="relative rounded-3xl border border-white/10 bg-[#0B1020]/90 p-4 shadow-2xl">
            <div className="mb-4 flex items-center gap-2 border-b border-white/10 pb-4">
              <div className="h-3 w-3 rounded-full bg-red-400/80" />
              <div className="h-3 w-3 rounded-full bg-yellow-400/80" />
              <div className="h-3 w-3 rounded-full bg-green-400/80" />
              <p className="ml-4 text-xs text-gray-500">Opportunity report</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <p className="mb-2 text-sm text-violet-400">
                Opportunity detected
              </p>

              <div className="flex items-start justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-semibold">
                    CRM for Freelance Designers
                  </h2>
                  <p className="mt-3 max-w-sm text-sm text-gray-400">
                    Repeated complaints around missed follow-ups, lost leads,
                    and scattered client notes.
                  </p>
                </div>

                <div className="rounded-2xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-center">
                  <p className="text-3xl font-bold">8.4</p>
                  <p className="text-xs text-gray-400">score</p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  "Pain: High",
                  "Trend: Growing",
                  "MVP: Simple",
                  "Pricing: $19/mo",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300"
                  >
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl bg-gradient-to-r from-violet-600/20 to-cyan-500/10 p-5">
                <p className="text-sm text-gray-400">Suggested MVP</p>
                <p className="mt-2 text-sm">
                  Lead tracker, follow-up reminders, simple pipeline, client
                  notes, and weekly opportunity summary.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-white/10 bg-white/[0.02] px-6 py-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-gray-400 md:flex-row">
          <p>Built for indie hackers, solo founders, and developers.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <span className="rounded-full bg-white/5 px-4 py-2">
              Pain point discovery
            </span>
            <span className="rounded-full bg-white/5 px-4 py-2">
              MVP suggestions
            </span>
            <span className="rounded-full bg-white/5 px-4 py-2">
              Opportunity scoring
            </span>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <p className="mb-4 text-sm uppercase tracking-widest text-violet-400">
              The Problem
            </p>
            <h2 className="text-4xl font-bold tracking-tight">
              Finding a good SaaS idea is harder than building one.
            </h2>
          </div>

          <div>
            <p className="text-lg leading-relaxed text-gray-400">
              Most founders waste weeks browsing Reddit, X, forums, and reviews
              trying to guess what people actually need. SaaSScout turns that
              chaos into a structured opportunity report.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                "Too many generic ideas",
                "No clear evidence of demand",
                "Hard to know what people would pay for",
                "Research takes hours every week",
              ].map((problem) => (
                <div
                  key={problem}
                  className="rounded-2xl border border-white/10 bg-white/5 p-5"
                >
                  {problem}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        className="mx-auto max-w-7xl border-t border-white/10 px-6 py-24"
      >
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-sm uppercase tracking-widest text-violet-400">
            How It Works
          </p>

          <h2 className="text-4xl font-bold">
            Turn market noise into clear SaaS opportunities.
          </h2>

          <p className="mt-6 text-lg text-gray-400">
            A simple workflow: choose a niche, scan real conversations, detect
            pain points, and receive ranked ideas.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-4">
          {[
            [
              "01",
              "Choose a niche",
              "Enter a market like freelancers, creators, fitness coaches, or real estate agents.",
            ],
            [
              "02",
              "Scan conversations",
              "Analyze public discussions from Reddit and X to find repeated demand signals.",
            ],
            [
              "03",
              "Detect pain points",
              "Group complaints, frustrations, expensive workflows, and unmet needs.",
            ],
            [
              "04",
              "Get ranked ideas",
              "Receive scored SaaS opportunities with MVP suggestions and pricing angles.",
            ],
          ].map(([number, title, text]) => (
            <div
              key={number}
              className="rounded-3xl border border-white/10 bg-[#0B1020] p-6 transition hover:-translate-y-1 hover:border-violet-400/40"
            >
              <span className="text-sm font-bold text-violet-400">
                {number}
              </span>
              <h3 className="mt-4 text-xl font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-400">
                {text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Score */}
      <section
        id="score"
        className="mx-auto max-w-7xl border-t border-white/10 px-6 py-24"
      >
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <p className="mb-4 text-sm uppercase tracking-widest text-violet-400">
              Opportunity Score
            </p>

            <h2 className="text-4xl font-bold">
              Prioritize ideas with the Founder Opportunity Score.
            </h2>

            <p className="mt-6 text-lg leading-relaxed text-gray-400">
              Every opportunity is scored using signals that matter: pain
              intensity, frequency, willingness to pay, competition, build
              simplicity, and trend momentum.
            </p>

            <a
              href="#join-beta"
              className="mt-8 inline-block rounded-xl bg-white px-6 py-3 font-semibold text-[#050816] transition hover:bg-gray-200"
            >
              Get early access
            </a>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-8 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-violet-400">
                  Founder Opportunity Score™
                </p>
                <h3 className="mt-3 text-6xl font-bold">8.4</h3>
                <p className="mt-1 text-gray-400">out of 10</p>
              </div>

              <div className="flex h-28 w-28 items-center justify-center rounded-full border-8 border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/30">
                <span className="font-bold">84%</span>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              {opportunityFactors.map(([label, value]) => (
                <div key={label}>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-gray-300">{label}</span>
                    <span>{value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
                      style={{ width: `${Number(value) * 10}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Example Opportunities */}
      <section className="mx-auto max-w-7xl border-t border-white/10 px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-sm uppercase tracking-widest text-violet-400">
            Real Outputs
          </p>

          <h2 className="text-4xl font-bold">
            Examples of opportunities SaaSScout can uncover.
          </h2>

          <p className="mt-6 text-lg text-gray-400">
            Get startup ideas backed by pain signals, monetization potential,
            and clear MVP directions.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {examples.map((example) => (
            <div
              key={example.title}
              className="rounded-3xl border border-white/10 bg-[#0B1020] p-6 transition hover:-translate-y-1 hover:border-cyan-400/30"
            >
              <p className="text-sm text-violet-400">
                Score: {example.score}
              </p>
              <h3 className="mt-3 text-2xl font-semibold">{example.title}</h3>
              <p className="mt-4 text-sm leading-relaxed text-gray-400">
                {example.description}
              </p>
              <div className="mt-6 rounded-xl bg-white/5 px-4 py-3 text-sm text-gray-300">
                Pricing Potential: {example.pricing}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA / Pricing */}
      <section
        id="pricing"
        className="mx-auto max-w-7xl border-t border-white/10 px-6 py-28"
      >
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-violet-600/20 to-cyan-500/20 p-10 text-center md:p-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_35%)]" />

          <div className="relative">
            <p className="mb-4 text-sm uppercase tracking-widest text-violet-300">
              Start Today
            </p>

            <h2 className="mx-auto max-w-3xl text-4xl font-bold leading-tight md:text-5xl">
              Stop guessing. Start building from real market pain.
            </h2>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-300">
              Join the SaaSScout beta and discover startup opportunities backed
              by real demand signals.
            </p>

            <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
              <a
                href="#join-beta"
                className="rounded-xl bg-violet-600 px-8 py-4 text-lg font-semibold shadow-xl shadow-violet-600/30 transition hover:bg-violet-500"
              >
                Join Beta
              </a>

              <button
                onClick={() => alert("Coming soon")}
                className="rounded-xl border border-white/20 bg-white/5 px-8 py-4 text-lg text-gray-200 transition hover:bg-white/10"
              >
                View Demo
              </button>
            </div>

            <BetaSignupForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-7xl border-t border-white/10 px-6 py-12">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div>
            <h3 className="text-xl font-bold">SaaSScout</h3>
            <p className="mt-2 text-sm text-gray-400">
              Find SaaS opportunities hidden in real market pain.
            </p>
          </div>

          <div className="flex gap-6 text-sm text-gray-400">
            <a href="#" className="transition hover:text-white">
              Privacy
            </a>
            <a href="#" className="transition hover:text-white">
              Terms
            </a>
            <a href="#" className="transition hover:text-white">
              Contact
            </a>
          </div>

          <p className="text-sm text-gray-500">
            © 2026 SaaSScout. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}