"use client";

import { useState } from "react";
import { supabase } from "./supabase";

export default function BetaSignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [niche, setNiche] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.from("beta-signups").insert([
      {
        name,
        email,
        role,
        niche,
      },
    ]);

    if (error) {
      setMessage("Something went wrong. Please try again.");
      console.error(error);
    } else {
      setMessage("You're on the beta list. Welcome to SaaSScout.");
      setName("");
      setEmail("");
      setRole("");
      setNiche("");
    }

    setLoading(false);
  }

  return (
    <form
      id="join-beta"
      onSubmit={handleSubmit}
      className="mt-10 max-w-xl mx-auto bg-[#0B1020] border border-white/10 rounded-2xl p-6 text-left"
    >
      <div className="grid gap-4">
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder:text-gray-500 outline-none focus:border-violet-500"
        />

        <input
          type="email"
          placeholder="Your email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder:text-gray-500 outline-none focus:border-violet-500"
        />

        <input
          type="text"
          placeholder="Your role: founder, developer, indie hacker..."
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder:text-gray-500 outline-none focus:border-violet-500"
        />

        <input
          type="text"
          placeholder="Niche you're interested in"
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder:text-gray-500 outline-none focus:border-violet-500"
        />

        <button
          type="submit"
          disabled={loading}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-60 px-6 py-3 rounded-xl font-semibold"
        >
          {loading ? "Joining..." : "Join Beta"}
        </button>

        {message && (
          <p className="text-sm text-gray-300 text-center">{message}</p>
        )}
      </div>
    </form>
  );
}