"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../supabase";
import { useRouter } from "next/navigation";

export default function UpdatePasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();

    setMessage("");

    if (password.length < 6) {
      setMessage("Password must contain at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setMessage("Password updated successfully.");

    setTimeout(() => {
      router.push("/dashboard");
    }, 1500);

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

          <h1 className="mt-8 text-3xl font-bold">
            Create a new password
          </h1>

          <p className="mt-3 text-gray-400">
            Choose a secure password for your SaaSScout account.
          </p>

          <form onSubmit={handleUpdatePassword} className="mt-8 space-y-4">
            <input
              type="password"
              required
              minLength={6}
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-violet-500"
            />

            <input
              type="password"
              required
              minLength={6}
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-violet-500"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-violet-600 px-5 py-3 font-semibold shadow-lg shadow-violet-600/30 transition hover:bg-violet-500 disabled:opacity-60"
            >
              {loading ? "Updating..." : "Update password"}
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