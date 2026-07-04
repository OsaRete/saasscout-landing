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
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (loading) return;

    setLoading(true);
    setMessage("");
    setIsSuccess(false);

    const { error } = await supabase.from("beta-signups").insert([
      {
        name,
        email,
        role,
        niche,
      },
    ]);

    if (error) {
      setIsSuccess(false);
      setMessage("Something went wrong. Please try again.");
      console.error(error);
    } else {
      setIsSuccess(true);
      setMessage(
        "You’re in! Thanks for joining the SaaSScout beta. We’ll contact you soon."
      );

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
      className="mx-auto mt-10 max-w-xl rounded-[1.75rem] border border-white/10 bg-[#0B1020]/95 p-6 text-left shadow-2xl shadow-black/30"
    >
      <div className="mb-6">
        <p className="text-sm font-semibold text-violet-200">Request beta access</p>
        <p className="mt-2 text-sm leading-6 text-gray-400">
          Tell us who you are and which market you want to investigate first.
        </p>
      </div>

      <div className="grid gap-4">
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-gray-500 focus:border-violet-500 focus:bg-white/10"
        />

        <input
          type="email"
          placeholder="Your email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-gray-500 focus:border-violet-500 focus:bg-white/10"
        />

        <input
          type="text"
          placeholder="Your role: founder, developer, indie hacker..."
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-gray-500 focus:border-violet-500 focus:bg-white/10"
        />

        <input
          type="text"
          placeholder="Niche you're interested in"
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-gray-500 focus:border-violet-500 focus:bg-white/10"
        />

        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-violet-600 px-6 py-3 font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Joining..." : "Join Beta"}
        </button>

        {message && (
          <div
            className={`rounded-xl border px-4 py-3 text-center text-sm ${
              isSuccess
                ? "border-violet-500/30 bg-violet-500/10 text-violet-200"
                : "border-red-500/30 bg-red-500/10 text-red-200"
            }`}
          >
            {message}
          </div>
        )}
      </div>
    </form>
  );
}
