"use client";

import Image from "next/image";
import BetaSignupForm from "./BetaSignupForm";

export default function Home() {
  const scrollToSection = (id: string) => {
    const section = document.getElementById(id);
    if (section) {
      section.scrollIntoView({ behavior: "smooth" });
    }
  };

  const comingSoon = () => {
    alert("Coming soon 🚀");
  };

  return (
    <main className="min-h-screen bg-[#050816] text-white overflow-x-hidden">
      {/* NAVBAR */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#050816]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          
          {/* LOGO NUEVO */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-3"
          >
            <Image
              src="/brand/logo-main.png"
              alt="SaaSScout"
              width={180}
              height={50}
              priority
              className="h-10 w-auto"
            />
          </button>

          {/* LINKS */}
          <div className="hidden md:flex gap-8 text-sm text-gray-300">
            <button
              onClick={() => scrollToSection("how-it-works")}
              className="hover:text-white transition"
            >
              How it works
            </button>

            <button
              onClick={() => scrollToSection("score")}
              className="hover:text-white transition"
            >
              Score
            </button>

            <button
              onClick={() => scrollToSection("pricing")}
              className="hover:text-white transition"
            >
              Pricing
            </button>
          </div>

          {/* CTA */}
          <button
            onClick={() => scrollToSection("join-beta")}
            className="bg-violet-600 hover:bg-violet-500 px-4 py-2 rounded-xl text-sm font-medium transition"
          >
            Join Beta
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="max-w-7xl mx-auto px-6 py-24 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <div className="inline-block border border-violet-500/30 bg-violet-500/10 px-4 py-2 rounded-full text-sm text-violet-300 mb-6">
            AI Founder Intelligence for indie builders
          </div>

          <h1 className="text-5xl md:text-7xl font-bold leading-tight">
            Find SaaS ideas hidden in real market pain.
          </h1>

          <p className="text-gray-400 mt-8 text-xl leading-relaxed max-w-xl">
            SaaSScout scans conversations across the internet to uncover real
            frustrations, rank startup opportunities, and suggest profitable MVP
            ideas.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => scrollToSection("join-beta")}
              className="bg-violet-600 hover:bg-violet-500 px-8 py-4 rounded-xl font-semibold text-lg transition"
            >
              Join Beta
            </button>

            <button
              onClick={comingSoon}
              className="border border-white/15 hover:border-white/30 px-8 py-4 rounded-xl text-lg text-gray-300 transition"
            >
              View Demo
            </button>
          </div>
        </div>

        {/* CARD */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-violet-400 text-sm font-medium">
              Opportunity Detected
            </span>

            <Image
              src="/brand/logo-icon.png"
              alt="SaaSScout"
              width={34}
              height={34}
              className="rounded-lg"
            />
          </div>

          <h3 className="text-3xl font-bold mt-6">
            CRM for Freelance Designers
          </h3>

          <div className="mt-8 space-y-3 text-gray-300">
            <p>Opportunity Score: 8.4 / 10</p>
            <p>Pain Intensity: High</p>
            <p>Frequency: Growing</p>
            <p>Competition: Medium</p>
            <p>Pricing Potential: $19/mo</p>
          </div>

          <div className="mt-8 rounded-2xl bg-white/5 p-5 border border-white/10">
            <p className="text-sm text-gray-400">Suggested MVP</p>
            <p className="mt-2">
              Lead tracker, reminders, simple pipeline, notes, invoices.
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section
        id="how-it-works"
        className="max-w-7xl mx-auto px-6 py-24 border-t border-white/10"
      >
        <div className="text-center max-w-3xl mx-auto">
          <p className="text-violet-400 uppercase text-sm tracking-widest mb-4">
            How It Works
          </p>

          <h2 className="text-4xl font-bold">
            Turn internet noise into startup opportunities.
          </h2>

          <p className="text-gray-400 mt-6 text-lg">
            Discover pain points people complain about every day.
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-6 mt-14">
          {[
            ["01", "Choose niche"],
            ["02", "Scan discussions"],
            ["03", "Detect pain"],
            ["04", "Rank ideas"],
          ].map(([n, title]) => (
            <div
              key={n}
              className="rounded-2xl border border-white/10 bg-white/5 p-6"
            >
              <span className="text-violet-400 font-bold">{n}</span>
              <h3 className="text-xl font-semibold mt-4">{title}</h3>
            </div>
          ))}
        </div>
      </section>

      {/* SCORE */}
      <section
        id="score"
        className="max-w-7xl mx-auto px-6 py-24 border-t border-white/10"
      >
        <div className="grid md:grid-cols-2 gap-14 items-center">
          <div>
            <p className="text-violet-400 uppercase text-sm tracking-widest mb-4">
              Founder Opportunity Score
            </p>

            <h2 className="text-4xl font-bold">
              Prioritize ideas with real signals.
            </h2>

            <p className="text-gray-400 mt-6 text-lg">
              Pain intensity, frequency, pricing power, simplicity, momentum.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <div className="text-6xl font-bold text-violet-400">8.4</div>
            <p className="text-gray-400 mt-2">out of 10</p>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section
        id="pricing"
        className="max-w-7xl mx-auto px-6 py-24 border-t border-white/10"
      >
        <div className="text-center max-w-3xl mx-auto">
          <p className="text-violet-400 uppercase text-sm tracking-widest mb-4">
            Pricing
          </p>

          <h2 className="text-4xl font-bold">Simple founder pricing.</h2>

          <p className="text-gray-400 mt-6 text-lg">
            Join beta now. Early users get priority access.
          </p>
        </div>

        <div className="max-w-xl mx-auto mt-12 rounded-3xl border border-violet-500/30 bg-violet-500/10 p-10 text-center">
          <h3 className="text-3xl font-bold">Beta Access</h3>
          <p className="text-6xl font-bold mt-6">$0</p>
          <p className="text-gray-400 mt-3">Limited early access</p>

          <button
            onClick={() => scrollToSection("join-beta")}
            className="mt-8 bg-violet-600 hover:bg-violet-500 px-8 py-4 rounded-xl font-semibold"
          >
            Join Beta
          </button>
        </div>
      </section>

      {/* JOIN BETA */}
      <section
        id="join-beta"
        className="max-w-7xl mx-auto px-6 py-28 border-t border-white/10"
      >
        <div className="rounded-3xl border border-white/10 bg-gradient-to-r from-violet-600/20 to-cyan-500/10 p-12">
          <div className="text-center max-w-3xl mx-auto">
            <p className="text-violet-400 uppercase text-sm tracking-widest mb-4">
              Join Beta
            </p>

            <h2 className="text-4xl md:text-5xl font-bold">
              Real pain. Real ideas. Real SaaS.
            </h2>

            <p className="text-gray-300 mt-6 text-lg">
              Get early access and help shape the future of founder research.
            </p>
          </div>

          <div className="mt-12 max-w-2xl mx-auto">
            <BetaSignupForm />
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-white/10">
        <div className="flex flex-col md:flex-row gap-8 justify-between items-center">
          <div>
            <Image
              src="/brand/logo-main.png"
              alt="SaaSScout"
              width={170}
              height={48}
              className="h-10 w-auto"
            />

            <p className="text-gray-400 text-sm mt-3">
              Real pain. Real ideas. Real SaaS.
            </p>
          </div>

          <div className="flex gap-6 text-sm text-gray-400">
            <a href="#" className="hover:text-white transition">
              Privacy
            </a>
            <a href="#" className="hover:text-white transition">
              Terms
            </a>
            <a href="#" className="hover:text-white transition">
              Contact
            </a>
          </div>

          <p className="text-gray-500 text-sm">
            © 2026 SaaSScout. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}