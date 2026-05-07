"use client";

import Image from "next/image";
import Link from "next/link";
import BetaSignupForm from "./BetaSignupForm";
import HeroCarousel from "./HeroCarousel";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#050816] text-white">
      {/* Top Bar */}
      <div className="hidden border-b border-white/10 bg-[#02040d] px-6 py-2 text-xs text-gray-400 md:block">
        <div className="mx-auto flex max-w-7xl justify-end gap-6">
          <span>AI Founder Intelligence</span>
          <span>Private Beta</span>
          <span>Built for indie founders</span>
        </div>
      </div>

      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#050816]/95 backdrop-blur-xl">
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

            <Link
              href="/login"
              className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:bg-violet-500"
            >
              Open App
            </Link>
          </div>
        </div>
      </nav>

      <HeroCarousel />

      <section id="how-it-works" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-violet-400">
            How it works
          </p>

          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            From online complaints to clear SaaS opportunities.
          </h2>

          <p className="mt-6 text-lg leading-relaxed text-gray-400">
            SaaSScout helps founders discover real problems, understand demand,
            and decide what software idea is worth building.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Scan a market",
              text: "Enter a niche, audience, or customer segment you want to analyze.",
            },
            {
              title: "Generate opportunities",
              text: "SaaSScout turns that market into scored SaaS opportunities with MVP ideas.",
            },
            {
              title: "Save your best ideas",
              text: "Keep promising opportunities in your private dashboard for later validation.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-xl transition hover:-translate-y-1 hover:border-violet-500/40"
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600/20 text-xl text-violet-300">
                ✦
              </div>

              <h3 className="text-2xl font-bold">{item.title}</h3>
              <p className="mt-4 leading-relaxed text-gray-400">{item.text}</p>
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
              Built to find pain, not hype.
            </h2>

            <p className="mt-6 text-lg leading-relaxed text-gray-400">
              Instead of generating random startup ideas, SaaSScout helps you
              structure repeated frustration into product opportunities you can
              evaluate, save, and validate.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-8 shadow-2xl">
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                "Too much manual work",
                "No simple tool exists",
                "Current tools are expensive",
                "People ask for automation",
                "Repeated workflow friction",
                "Clear niche demand",
              ].map((signal) => (
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
            Ideas founders can actually evaluate.
          </h2>

          <p className="mt-6 text-lg leading-relaxed text-gray-400">
            The private beta already includes login, scans, results, opportunity
            details, and saved ideas.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {[
            {
              score: "8.6",
              title: "CRM for Freelance Designers",
              text: "Track leads, proposals, follow-ups and client notes in one simple workflow.",
            },
            {
              score: "7.9",
              title: "Automation Tool for Coaches",
              text: "Help coaches manage check-ins, reminders, payments and scheduling.",
            },
            {
              score: "7.6",
              title: "Review Insights for Local Businesses",
              text: "Turn repeated customer complaints into operational improvement ideas.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-3xl border border-white/10 bg-[#0B1020] p-7 shadow-xl transition hover:-translate-y-1 hover:border-cyan-400/40"
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="text-sm text-violet-300">Opportunity</span>
                <span className="rounded-full bg-violet-500/15 px-3 py-1 text-sm text-violet-200">
                  {item.score}/10
                </span>
              </div>

              <h3 className="text-2xl font-bold">{item.title}</h3>
              <p className="mt-4 leading-relaxed text-gray-400">{item.text}</p>
            </div>
          ))}
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
            Create scans, review opportunities, inspect details, and save the
            ideas you want to validate.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="rounded-xl bg-violet-600 px-6 py-3 font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:bg-violet-500"
            >
              Open App
            </Link>

            <a
              href="#join-beta"
              className="rounded-xl border border-white/10 px-6 py-3 font-semibold text-gray-300 transition hover:bg-white/5 hover:text-white"
            >
              Join Waitlist
            </a>
          </div>
        </div>
      </section>

      <section id="join-beta" className="w-full py-28">
        <div className="border-y border-white/10 bg-gradient-to-r from-violet-600/20 to-cyan-500/10 px-6 py-20 text-center shadow-2xl md:px-20">
          <Image
            src="/brand/logo-icon.png"
            alt="SaaSScout"
            width={64}
            height={64}
            className="mx-auto mb-6 rounded-2xl"
          />

          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            Real pain. Real ideas. Real SaaS.
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-300">
            Join the SaaSScout beta or open the private app if you already have
            access.
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