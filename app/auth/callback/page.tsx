"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../supabase";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function finishLogin() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        router.push("/dashboard");
      } else {
        router.push("/login");
      }
    }

    finishLogin();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050816] text-white">
      <p className="text-gray-400">Signing you in...</p>
    </main>
  );
}