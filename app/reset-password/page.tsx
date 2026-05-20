"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../supabase";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Password reset email sent. Please check your inbox.");
      setEmail("");
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0B1020] p-8 shadow-2xl md:p-10">
          <Image
            src="/brand/logo-main.png"
            alt="SaaSScout"
            width={180}
            height={50}
            className="h-10 w-auto"
          />

          <Link
            href="/login"
            className="mt-8 inline-block text-sm text-gray-400 hover:text-white"
          >
            ← Back to login
          </Link>

          <h1 className="mt-8 text-3xl font-bold">Reset your password</h1>

          <p className="mt-3 text-gray-400">
            Enter your email and we’ll send you a link to create a new password.
          </p>

          <form onSubmit={handleResetPassword} className="mt-8 space-y-4">
            <input
              type="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-violet-500"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-violet-600 px-5 py-3 font-semibold shadow-lg shadow-violet-600/30 transition hover:bg-violet-500 disabled:opacity-60"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>

          {message && (
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-gray-300">
              {message}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}