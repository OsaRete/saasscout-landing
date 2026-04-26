export default function Home() {
  return (
    <main className="min-h-screen bg-[#050816] text-white">
      {/* Navbar */}
      <nav className="w-full border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">SaaSScout</h1>

          <div className="hidden md:flex gap-8 text-sm text-gray-300">
            <a href="#">How it works</a>
            <a href="#">Score</a>
            <a href="#">Pricing</a>
          </div>

          <button className="bg-violet-600 hover:bg-violet-500 px-4 py-2 rounded-lg text-sm font-medium">
            Join Beta
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 py-24 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-violet-400 text-sm mb-4 uppercase tracking-widest">
            AI Founder Intelligence
          </p>

          <h2 className="text-5xl font-bold leading-tight">
            Find SaaS opportunities hidden in real market complaints.
          </h2>

          <p className="text-gray-400 mt-6 text-lg leading-relaxed">
            SaaSScout analyzes conversations from Reddit and X to uncover pain
            points, rank opportunities, and suggest MVP ideas for indie founders.
          </p>

          <div className="mt-8 flex gap-4">
            <button className="bg-violet-600 hover:bg-violet-500 px-6 py-3 rounded-xl font-semibold">
              Join Beta
            </button>

            <button className="border border-white/20 px-6 py-3 rounded-xl text-gray-300">
              View Demo
            </button>
          </div>
        </div>

        {/* Mockup Card */}
        <div className="bg-[#0B1020] border border-white/10 rounded-2xl p-8 shadow-2xl">
          <p className="text-sm text-violet-400 mb-2">Opportunity Detected</p>

          <h3 className="text-2xl font-semibold">
            CRM for Freelance Designers
          </h3>

          <div className="mt-6 space-y-3 text-gray-300">
            <p>Opportunity Score: 8.4 / 10</p>
            <p>Pain Intensity: High</p>
            <p>Frequency: Growing</p>
            <p>Build Difficulty: Medium</p>
            <p>Pricing Potential: $19/mo</p>
          </div>

          <div className="mt-6 p-4 rounded-xl bg-white/5">
            <p className="text-sm text-gray-400">Suggested MVP</p>
            <p className="mt-2 text-sm">
              Lead tracker, reminders, simple pipeline, client notes.
            </p>
          </div>
        </div>
      </section>
      {/* Problem Section */}
<section className="max-w-7xl mx-auto px-6 py-24 border-t border-white/10">
  <div className="max-w-3xl">
    <p className="text-violet-400 uppercase text-sm tracking-widest mb-4">
      The Problem
    </p>

    <h2 className="text-4xl font-bold">
      Finding a good SaaS idea is harder than building one.
    </h2>

    <p className="text-gray-400 mt-6 text-lg leading-relaxed">
      Most founders waste weeks browsing Reddit, Twitter, forums and reviews
      trying to guess what people actually need.
    </p>

    <div className="grid md:grid-cols-2 gap-4 mt-10">
      <div className="bg-white/5 rounded-xl p-5">
        Too many generic ideas
      </div>

      <div className="bg-white/5 rounded-xl p-5">
        No clear evidence of demand
      </div>

      <div className="bg-white/5 rounded-xl p-5">
        Hard to know what people would pay for
      </div>

      <div className="bg-white/5 rounded-xl p-5">
        Research takes hours every week
      </div>
    </div>
  </div>
</section>
{/* How It Works */}
<section className="max-w-7xl mx-auto px-6 py-24 border-t border-white/10">
  <div className="text-center max-w-3xl mx-auto">
    <p className="text-violet-400 uppercase text-sm tracking-widest mb-4">
      How It Works
    </p>

    <h2 className="text-4xl font-bold">
      Turn market noise into clear SaaS opportunities.
    </h2>

    <p className="text-gray-400 mt-6 text-lg">
      SaaSScout transforms public conversations into ranked startup ideas you
      can actually evaluate and build.
    </p>
  </div>

  <div className="grid md:grid-cols-4 gap-6 mt-14">
    <div className="bg-[#0B1020] border border-white/10 rounded-2xl p-6">
      <span className="text-violet-400 font-bold">01</span>
      <h3 className="text-xl font-semibold mt-4">Choose a niche</h3>
      <p className="text-gray-400 mt-3 text-sm">
        Enter a market like freelancers, creators, fitness coaches, or real estate agents.
      </p>
    </div>

    <div className="bg-[#0B1020] border border-white/10 rounded-2xl p-6">
      <span className="text-violet-400 font-bold">02</span>
      <h3 className="text-xl font-semibold mt-4">Scan conversations</h3>
      <p className="text-gray-400 mt-3 text-sm">
        Analyze public discussions from Reddit and X to find repeated signals.
      </p>
    </div>

    <div className="bg-[#0B1020] border border-white/10 rounded-2xl p-6">
      <span className="text-violet-400 font-bold">03</span>
      <h3 className="text-xl font-semibold mt-4">Detect pain points</h3>
      <p className="text-gray-400 mt-3 text-sm">
        Group complaints, frustrations, expensive workflows, and unmet needs.
      </p>
    </div>

    <div className="bg-[#0B1020] border border-white/10 rounded-2xl p-6">
      <span className="text-violet-400 font-bold">04</span>
      <h3 className="text-xl font-semibold mt-4">Get ranked ideas</h3>
      <p className="text-gray-400 mt-3 text-sm">
        Receive scored SaaS opportunities with MVP suggestions and pricing angles.
      </p>
    </div>
  </div>
</section>
{/* Opportunity Score */}
<section className="max-w-7xl mx-auto px-6 py-24 border-t border-white/10">
  <div className="grid md:grid-cols-2 gap-12 items-center">
    <div>
      <p className="text-violet-400 uppercase text-sm tracking-widest mb-4">
        Opportunity Score
      </p>

      <h2 className="text-4xl font-bold">
        Prioritize ideas with the Founder Opportunity Score.
      </h2>

      <p className="text-gray-400 mt-6 text-lg leading-relaxed">
        Every opportunity is scored using signals that matter: pain intensity,
        frequency, willingness to pay, competition, build simplicity, and trend momentum.
      </p>
    </div>

    <div className="bg-[#0B1020] border border-white/10 rounded-2xl p-8 shadow-2xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-violet-400">Founder Opportunity Score™</p>
          <h3 className="text-5xl font-bold mt-3">8.4</h3>
          <p className="text-gray-400 mt-1">out of 10</p>
        </div>

        <div className="h-24 w-24 rounded-full border-8 border-violet-500 flex items-center justify-center">
          <span className="font-bold">84%</span>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        {[
          ["Pain Intensity", "9.1"],
          ["Frequency", "8.0"],
          ["Willingness to Pay", "8.5"],
          ["Competition", "6.8"],
          ["Build Simplicity", "8.7"],
          ["Trend Momentum", "7.9"],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-300">{label}</span>
              <span className="text-white">{value}</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full"
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
<section className="max-w-7xl mx-auto px-6 py-24 border-t border-white/10">
  <div className="text-center max-w-3xl mx-auto">
    <p className="text-violet-400 uppercase text-sm tracking-widest mb-4">
      Real Outputs
    </p>

    <h2 className="text-4xl font-bold">
      Examples of opportunities SaaSScout can uncover.
    </h2>

    <p className="text-gray-400 mt-6 text-lg">
      Get startup ideas backed by pain signals, monetization potential, and clear MVP directions.
    </p>
  </div>

  <div className="grid md:grid-cols-3 gap-6 mt-14">
    
    <div className="bg-[#0B1020] border border-white/10 rounded-2xl p-6">
      <p className="text-violet-400 text-sm">Score: 8.4</p>
      <h3 className="text-2xl font-semibold mt-3">
        CRM for Freelancers
      </h3>
      <p className="text-gray-400 mt-4 text-sm">
        Manage leads, follow-ups, proposals, and client relationships in one simple place.
      </p>
      <div className="mt-6 text-sm text-gray-300">
        Pricing Potential: $19/mo
      </div>
    </div>

    <div className="bg-[#0B1020] border border-white/10 rounded-2xl p-6">
      <p className="text-violet-400 text-sm">Score: 7.9</p>
      <h3 className="text-2xl font-semibold mt-3">
        Booking Tool for Coaches
      </h3>
      <p className="text-gray-400 mt-4 text-sm">
        Sessions, reminders, payments, check-ins and scheduling for online fitness coaches.
      </p>
      <div className="mt-6 text-sm text-gray-300">
        Pricing Potential: $29/mo
      </div>
    </div>

    <div className="bg-[#0B1020] border border-white/10 rounded-2xl p-6">
      <p className="text-violet-400 text-sm">Score: 7.6</p>
      <h3 className="text-2xl font-semibold mt-3">
        Review Insights for Local Businesses
      </h3>
      <p className="text-gray-400 mt-4 text-sm">
        Turn customer complaints into operational improvements and growth actions.
      </p>
      <div className="mt-6 text-sm text-gray-300">
        Pricing Potential: $49/mo
      </div>
    </div>

  </div>
</section>
{/* Final CTA */}
<section className="max-w-7xl mx-auto px-6 py-28 border-t border-white/10">
  <div className="bg-gradient-to-r from-violet-600/20 to-cyan-500/20 border border-white/10 rounded-3xl p-12 text-center">

    <p className="text-violet-400 uppercase text-sm tracking-widest mb-4">
      Start Today
    </p>

    <h2 className="text-4xl md:text-5xl font-bold max-w-3xl mx-auto leading-tight">
      Stop guessing. Start building from real market pain.
    </h2>

    <p className="text-gray-300 mt-6 text-lg max-w-2xl mx-auto">
      Join the SaaSScout beta and discover startup opportunities backed by real demand signals.
    </p>

    <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
      <button className="bg-violet-600 hover:bg-violet-500 px-8 py-4 rounded-xl font-semibold text-lg">
        Join Beta
      </button>

      <button className="border border-white/20 px-8 py-4 rounded-xl text-lg text-gray-300">
        View Demo
      </button>
    </div>

  </div>
</section>
{/* Footer */}
<footer className="max-w-7xl mx-auto px-6 py-12 border-t border-white/10">
  <div className="flex flex-col md:flex-row items-center justify-between gap-6">

    <div>
      <h3 className="text-xl font-bold">SaaSScout</h3>
      <p className="text-gray-400 text-sm mt-2">
        Find SaaS opportunities hidden in real market pain.
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