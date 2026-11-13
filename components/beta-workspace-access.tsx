"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/app/supabase";
import { isFounderWorkspacePath } from "@/lib/auth/workspace-path";

type Admission = "checking" | "allowed" | "denied" | "signed_out" | "unavailable";

/** Presentation only. requireUser and restrictive RLS independently enforce admission. */
export default function BetaWorkspaceAccess({ children, validationAvailable }: {
  children: ReactNode;
  validationAvailable: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const protectedPath = isFounderWorkspacePath(pathname) &&
    (!pathname.startsWith("/validation") || validationAvailable);
  const [admission, setAdmission] = useState<Admission>("checking");
  const [approvedPath, setApprovedPath] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!protectedPath) return;
    let cancelled = false;
    let revision = 0;
    let approvedUserId: string | undefined;
    async function check() {
      const current = ++revision;
      let result: Admission = "unavailable";
      let userId: string | undefined;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) result = "signed_out";
        else {
          userId = session.user.id;
          // Rechecking a valid session must not unmount unsaved workspace forms.
          // A different identity must obtain its own admission before mounting.
          if (!cancelled && revision === current && approvedUserId !== userId) setAdmission("checking");
          const response = await fetch("/api/user/capabilities", {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: "no-store",
          });
          result = response.ok ? "allowed" : response.status === 403 ? "denied"
            : response.status === 401 ? "signed_out" : "unavailable";
        }
      } catch { /* Fixed safe state; do not disclose transport/configuration errors. */ }
      if (!cancelled && revision === current) {
        approvedUserId = result === "allowed" ? userId : undefined;
        setApprovedPath(result === "allowed" ? pathname : null);
        setAdmission(result);
        if (result === "signed_out") router.replace("/login");
      }
    }
    void check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // Leave the Supabase auth callback before calling getSession again.
      queueMicrotask(() => { if (!cancelled) void check(); });
    });
    const onFocus = () => { if (!cancelled) void check(); };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [protectedPath, pathname, retry, router]);

  const visibleAdmission = admission === "allowed" && approvedPath !== pathname ? "checking" : admission;
  if (!protectedPath || visibleAdmission === "allowed") return children;
  return <main className="mx-auto max-w-xl px-6 py-20 text-white" aria-live="polite">
    <h1 className="text-2xl font-semibold">{visibleAdmission === "checking" ? "Checking access…" : "SaaSScout private Beta"}</h1>
    {visibleAdmission === "denied" && <p className="mt-4 text-slate-300">An active Beta invitation is required. Contact the owner who invited you to request access.</p>}
    {visibleAdmission === "signed_out" && <p className="mt-4"><Link href="/login" className="text-violet-300">Sign in to check your Beta access</Link></p>}
    {visibleAdmission === "unavailable" && <p className="mt-4 text-slate-300">Access could not be verified. Please try again.</p>}
    {visibleAdmission !== "checking" && <button className="mt-6 rounded-lg bg-violet-600 px-4 py-2" onClick={() => setRetry((value) => value + 1)}>Check again</button>}
    <p className="mt-6"><Link href="/" className="text-slate-400">Back to home</Link></p>
  </main>;
}
