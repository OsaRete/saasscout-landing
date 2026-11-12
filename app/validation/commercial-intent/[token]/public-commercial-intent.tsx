"use client";
import { useEffect, useState } from "react";
import type { CommercialIntentContent } from "@/lib/validation/commercial-intent";
import { CommercialIntentExperience } from "@/components/validation/commercial-intent-experience";
export default function PublicCommercialIntent({ token }: { token: string }) {
  const [content, setContent] = useState<CommercialIntentContent | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/public/validation/commercial-intent/${token}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            "This commercial experiment is closed or unavailable.",
          );
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
          SaaSScout · Private commercial intent test
        </p>
        {content ? (
          <CommercialIntentExperience content={content} token={token} />
        ) : (
          <p role={error ? "alert" : "status"}>
            {error || "Loading commercial experiment…"}
          </p>
        )}
      </main>
    </div>
  );
}
