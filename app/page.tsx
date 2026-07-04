"use client";

import Image from "next/image";
import Link from "next/link";
import BetaSignupForm from "./BetaSignupForm";
import HeroCarousel from "./HeroCarousel";

const workflowSteps = [
  {
    eyebrow: "01",
    title: "Scan market signals",
    text: "Start with a niche, audience, or workflow. SaaSScout organizes public pain signals into a research path founders can review.",
  },
  {
    eyebrow: "02",
    title: "Detect repeated pain",
    text: "The system looks for recurring complaints, manual workarounds, expensive tools, and workflow friction instead of treating one comment as validation.",
  },
  {
    eyebrow: "03",
    title: "Rank opportunities",
    text: "Each opportunity is scored with evidence strength, pain intensity, niche clarity, monetization signals, and implementation realism in mind.",
  },
  {
    eyebrow: "04",
    title: "Summarize evidence",
    text: "Founders get concise evidence summaries, affected niches, and confidence context so they can decide what deserves deeper customer research.",
  },
  {
    eyebrow: "05",
    title: "Suggest next angles",
    text: "SaaSScout proposes possible MVP and pricing directions without pretending those suggestions replace interviews, validation, or execution.",
  },
];

const signalPills = [
  "Repeated complaints",
  "Manual spreadsheet work",
  "Expensive incumbent tools",
  "Workflow handoffs",
  "Niche-specific friction",
  "Automation requests",
  "Unclear ownership",
  "Evidence confidence",
];

const exampleOpportunities = [
  {
    score: "8.2",
    title: "Client intake tracker for solo tax preparers",
    niche: "Independent tax preparers and small bookkeeping firms",
    pain: "Clients send documents late, in mixed formats, and without clear status visibility before filing deadlines.",
    evidence: "Recurring complaints about chasing missing forms, duplicate email threads, and deadline anxiety during seasonal spikes.",
    mvp: "A lightweight client portal with checklist status, document reminders, and preparer-side follow-up queues.",
    pricing: "$19–$49/month per preparer during beta, with seasonal plan options to test willingness to pay.",
  },
  {
    score: "7.8",
    title: "Maintenance request triage for boutique property managers",
    niche: "Property managers with 20–150 rental units",
    pain: "Requests arrive through texts, calls, and email, making it hard to prioritize urgent issues and keep tenants updated.",
    evidence: "Multiple signals mention lost requests, unclear vendor handoffs, and tenants asking for status updates repeatedly.",
    mvp: "A shared inbox that categorizes urgency, groups duplicate updates, and creates a simple tenant status page.",
    pricing: "$1–$2 per unit/month or a flat starter tier for managers under 50 units.",
  },
  {
    score: "7.4",
    title: "Review-response insights for local clinics",
    niche: "Dental, med spa, and wellness clinics with recurring local reviews",
    pain: "Owners struggle to separate one-off complaints from patterns that affect retention and operations.",
    evidence: "Signals cluster around slow replies, repeated scheduling issues, and difficulty turning reviews into action items.",
    mvp: "A review digest that tags repeated issues, drafts response notes, and highlights operational patterns by location.",
    pricing: "$39–$99/month per location depending on review volume and reporting depth.",
  },
];

const clarityItems = [
  {
    title: "What SaaSScout helps with",
    points: [
      "Finding recurring market pain from real signals",
      "Comparing opportunities with structured scoring",
      "Summarizing evidence so research starts faster",
      "Suggesting possible MVP and pricing angles",
    ],
  },
  {
    title: "What founders still own",
    points: [
      "Customer interviews and direct validation",
      "Final product, pricing, and positioning decisions",
      "Execution quality, distribution, and sales",
      "Judgment when evidence is incomplete or mixed",
    ],
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.22),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(34,211,238,0.14),_transparent_30%),linear-gradient(180deg,_#050816_0%,_#060817_46%,_#03050d_100%)]" />

      {/* Top Bar */}
      <div className="hidden border-b border-white/10 bg-[#02040d]/95 px-6 py-2 text-xs text-gray-400 md:block">
        <div className="mx-auto flex max-w-7xl justify-end gap-6">
          <span>AI-assisted market intelligence</span>
          <span>Evidence-first opportunity scans</span>
          <span>Private beta for indie founders</span>
        </div>
      </div>

      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#050816]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <a href="#" className="flex items-center">
            <Image
              src="/brand/logo-main.png"
              alt="SaaSScout"
              width={170}
              height={48}
              priority
              className="h-10 w-auto"
            />
          </a>

          <div className="hidden items-center gap-8 text-sm font-medium text-gray-300 md:flex">
            <a href="#how-it-works" className="transition hover:text-white">
              How it works
            </a>
            <a href="#signals" className="transition hover:text-white">
              Signals
            </a>
            <a href="#examples" className="transition hover:text-white">
              Examples
            </a>
            <a href="#clarity" className="transition hover:text-white">
              Clarity
            </a>
            <a href="#join-beta" className="transition hover:text-white">
              Beta
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-gray-300 transition hover:bg-white/5 hover:text-white sm:inline-block"
            >
              Login
            </Link>

            <a
              href="#beta-form"
              className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:bg-violet-500"
            >
              Join Beta
            </a>
          </div>
        </div>
      </nav>

      <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 pb-14 pt-16 md:grid-cols-[1.02fr_0.98fr] md:pb-20 md:pt-24">
        <div>
          <div className="mb-6 inline-flex rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-200 shadow-lg shadow-violet-950/20">
            Evidence-assisted opportunity discovery for indie founders
          </div>

          <h1 className="max-w-4xl text-5xl font-black tracking-tight md:text-7xl">
            Discover SaaS opportunities from real market pain.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-300 md:text-xl">
            SaaSScout helps founders scan market signals, detect repeated
            complaints, rank opportunities, summarize evidence, and explore
            practical MVP and pricing angles—without pretending research is
            magic.
          </p>

          <div className="mt-9 flex flex-col gap-4 sm:flex-row">
            <a
              href="#beta-form"
              className="rounded-2xl bg-violet-600 px-7 py-4 text-center font-bold text-white shadow-xl shadow-violet-600/30 transition hover:-translate-y-0.5 hover:bg-violet-500"
            >
              Join the private beta
            </a>

            <a
              href="#examples"
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-7 py-4 text-center font-bold text-gray-200 transition hover:-translate-y-0.5 hover:bg-white/[0.07] hover:text-white"
            >
              View example output
            </a>
          </div>

          <div className="mt-8 grid gap-3 text-sm text-gray-400 sm:grid-cols-3">
            <span className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              No guaranteed outcomes
            </span>
            <span className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              Evidence before ideas
            </span>
            <span className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              Founder decision support
            </span>
          </div>
        </div>

        <HeroCarousel />
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-violet-400">
            How it works
          </p>

          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            From scattered signals to structured founder decisions.
          </h2>

          <p className="mt-6 text-lg leading-relaxed text-gray-400">
            The landing experience now mirrors the real product: opportunity
            discovery grounded in complaints, workflows, evidence, scoring, and
            AI-assisted analysis.
          </p>
        </div>

        <div className="mt-16 grid gap-5 md:grid-cols-5">
          {workflowSteps.map((item) => (
            <div
              key={item.title}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-xl shadow-black/20 transition hover:-translate-y-1 hover:border-violet-500/40 hover:bg-white/[0.06]"
            >
              <div className="mb-5 inline-flex rounded-full border border-violet-400/20 bg-violet-600/15 px-3 py-1 text-xs font-bold text-violet-200">
                {item.eyebrow}
              </div>

              <h3 className="text-xl font-bold">{item.title}</h3>
              <p className="mt-4 text-sm leading-6 text-gray-400">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="signals" className="mx-auto max-w-7xl px-6 py-24">
        <div className="grid items-center gap-14 md:grid-cols-2">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-violet-400">
              Market signals
            </p>

            <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
              Built to separate repeated pain from startup noise.
            </h2>

            <p className="mt-6 text-lg leading-relaxed text-gray-400">
              SaaSScout is not a random idea generator. It helps structure weak
              signals into research-ready opportunities by showing what pain is
              recurring, who appears affected, and what evidence supports the
              score.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[#0B1020]/90 p-8 shadow-2xl shadow-cyan-950/20">
            <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold text-cyan-200">Signal map</p>
                <p className="mt-1 text-sm text-gray-500">Inputs founders can evaluate</p>
              </div>
              <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                Evidence-led
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {signalPills.map((signal) => (
                <div
                  key={signal}
                  className="rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-4 text-sm font-medium text-gray-300"
                >
                  {signal}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="examples" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-violet-400">
            Example output
          </p>

          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            Opportunity cards that look like decision support, not hype.
          </h2>

          <p className="mt-6 text-lg leading-relaxed text-gray-400">
            Example cards show the kind of structured output founders can use to
            decide what deserves deeper validation.
          </p>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {exampleOpportunities.map((item) => (
            <article
              key={item.title}
              className="rounded-[2rem] border border-white/10 bg-[#0B1020]/95 p-7 shadow-xl shadow-black/25 transition hover:-translate-y-1 hover:border-cyan-400/40"
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-widest text-violet-300">
                    Opportunity
                  </span>
                  <h3 className="mt-2 text-2xl font-bold leading-tight">{item.title}</h3>
                </div>
                <span className="shrink-0 rounded-2xl border border-violet-400/20 bg-violet-500/15 px-3 py-2 text-sm font-bold text-violet-100">
                  {item.score}/10
                </span>
              </div>

              <div className="space-y-4 text-sm leading-6 text-gray-400">
                <p>
                  <span className="font-semibold text-gray-200">Affected niche:</span> {item.niche}
                </p>
                <p>
                  <span className="font-semibold text-gray-200">Pain:</span> {item.pain}
                </p>
                <p>
                  <span className="font-semibold text-gray-200">Evidence:</span> {item.evidence}
                </p>
                <p>
                  <span className="font-semibold text-gray-200">MVP angle:</span> {item.mvp}
                </p>
                <p>
                  <span className="font-semibold text-gray-200">Pricing angle:</span> {item.pricing}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="clarity" className="mx-auto max-w-7xl px-6 py-24">
        <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.025] p-8 shadow-2xl md:p-12">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
              Trust through clarity
            </p>
            <h2 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
              SaaSScout supports founder judgment. It does not replace it.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-gray-400">
              The product is designed to make opportunity research more
              structured and evidence-aware, while keeping final validation and
              execution decisions with the founder.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {clarityItems.map((group) => (
              <div key={group.title} className="rounded-3xl border border-white/10 bg-[#080d1d] p-7">
                <h3 className="text-2xl font-bold">{group.title}</h3>
                <ul className="mt-5 space-y-3 text-gray-400">
                  {group.points.map((point) => (
                    <li key={point} className="flex gap-3">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-violet-400" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="rounded-[2rem] border border-white/10 bg-[#0B1020] p-10 text-center shadow-2xl md:p-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
            Private beta app
          </p>

          <h2 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            Already invited? Open your SaaSScout dashboard.
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-400">
            Create scans, review scored opportunities, inspect evidence-backed
            details, and save ideas you want to validate further.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="rounded-xl bg-violet-600 px-6 py-3 font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:bg-violet-500"
            >
              Open App
            </Link>

            <a
              href="#beta-form"
              className="rounded-xl border border-white/10 px-6 py-3 font-semibold text-gray-300 transition hover:bg-white/5 hover:text-white"
            >
              Join Waitlist
            </a>
          </div>
        </div>
      </section>

      <section id="join-beta" className="w-full py-28">
        <div className="border-y border-white/10 bg-gradient-to-r from-violet-600/20 via-[#0B1020] to-cyan-500/10 px-6 py-20 text-center shadow-2xl md:px-20">
          <Image
            src="/brand/logo-icon.png"
            alt="SaaSScout"
            width={64}
            height={64}
            className="mx-auto mb-6 rounded-2xl shadow-xl shadow-violet-950/40"
          />

          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            Join the beta for evidence-assisted opportunity research.
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-300">
            Get early access to a market intelligence workflow for finding
            recurring pain, reviewing evidence, and deciding which SaaS
            opportunities deserve your next validation step.
          </p>

          <div className="mx-auto mt-8 flex max-w-xl flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="rounded-xl bg-violet-600 px-6 py-3 font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:bg-violet-500"
            >
              Open App
            </Link>

            <a
              href="#beta-form"
              className="rounded-xl border border-white/10 px-6 py-3 font-semibold text-gray-300 transition hover:bg-white/5 hover:text-white"
            >
              Join Waitlist
            </a>
          </div>

          <div id="beta-form">
            <BetaSignupForm />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
          <Image
            src="/brand/logo-main.png"
            alt="SaaSScout"
            width={160}
            height={44}
            className="h-9 w-auto"
          />

          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-400">
            <Link href="/privacy" className="transition hover:text-white">
              Privacy
            </Link>

            <Link href="/terms" className="transition hover:text-white">
              Terms
            </Link>

            <a
              href="mailto:contact@trysaasscout.com"
              className="transition hover:text-white"
            >
              Contact
            </a>

            <Link href="/login" className="transition hover:text-white">
              Login
            </Link>
          </div>

          <p className="text-sm text-gray-500">
            © 2026 SaaSScout. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
