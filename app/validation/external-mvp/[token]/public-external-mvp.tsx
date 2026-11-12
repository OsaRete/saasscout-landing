"use client";
import { useEffect, useState } from "react";
import type { ExternalMvpContent } from "@/lib/validation/external-mvp";
import { ExternalMvpExperience } from "@/components/validation/external-mvp-experience";
export default function PublicExternalMvp({ token }: { token: string }) {
  const [content, setContent] = useState<ExternalMvpContent | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/public/validation/external-mvp/${token}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("This MVP test is closed or unavailable.");
        return r.json();
      })
      .then((x) => {
        if (live) setContent(x.data);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [token]);
  return (
    <div className="min-h-screen bg-[#070b14]">
      <main className="mx-auto max-w-3xl px-4 py-10 text-white">
        <p className="mb-5 text-xs uppercase tracking-widest text-cyan-300">
          SaaSScout · Private external MVP test
        </p>
        {content ? (
          <ExternalMvpExperience content={content} token={token} />
        ) : (
          <p role={error ? "alert" : "status"}>
            {error || "Loading MVP test…"}
          </p>
        )}
      </main>
    </div>
  );
}
