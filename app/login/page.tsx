"use client";

import Image from "next/image";
import { useState } from "react";
import { supabase } from "../supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
      } else {
        setMessage("Account created. Check your email if confirmation is required.");
      }
    }

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
      } else {
        router.push("/dashboard");
      }
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 py-12">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#0B1020] shadow-2xl md:grid-cols-2">
          <div className="hidden bg-gradient-to-br from-violet-600/30 to-cyan-500/10 p-10 md:block">
            <Image
              src="/brand/logo-main.png"
              alt="SaaSScout"
              width={180}
              height={50}
              className="h-10 w-auto"
            />

            <div className="mt-20">
              <p className="text-sm uppercase tracking-widest text-violet-200">
                Founder Intelligence
              </p>

              <h1 className="mt-4 text-4xl font-bold leading-tight">
                Find real problems before you build.
              </h1>

              <p className="mt-6 text-gray-300">
                Access your SaaSScout dashboard, scan markets, and evaluate
                opportunities from real market pain.
              </p>
            </div>
          </div>

          <div className="p-8 md:p-10">
            <Link href="/" className="text-sm text-gray-400 hover:text-white">
              ← Back to landing
            </Link>

            <h2 className="mt-10 text-3xl font-bold">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h2>

            <p className="mt-3 text-gray-400">
              {mode === "login"
                ? "Sign in to continue to SaaSScout."
                : "Join the private beta and start exploring opportunities."}
            </p>

            <form onSubmit={handleAuth} className="mt-8 space-y-4">
              <input
                type="email"
                required
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-violet-500"
              />

              <input
                type="password"
                required
                minLength={6}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-violet-500"
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-violet-600 px-5 py-3 font-semibold shadow-lg shadow-violet-600/30 transition hover:bg-violet-500 disabled:opacity-60"
              >
                {loading
                  ? "Please wait..."
                  : mode === "login"
                  ? "Sign in"
                  : "Create account"}
              </button>
            </form>

            {message && (
              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-gray-300">
                {message}
              </div>
            )}

            <button
              onClick={() => {
                setMessage("");
                setMode(mode === "login" ? "signup" : "login");
              }}
              className="mt-6 text-sm text-violet-300 hover:text-violet-200"
            >
              {mode === "login"
                ? "Don’t have an account? Create one"
                : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}