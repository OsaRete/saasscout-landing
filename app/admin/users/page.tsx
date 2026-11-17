"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/supabase";

type Account = { user_id: string; email: string | null; verified: boolean; suspended: boolean;
  owner_administrator: boolean; deletion_requested_at: string | null; scans_used: number | null;
  scan_limit: number | null; scans_this_month: number; discoveries_this_month: number };
export default function UserAdministration() {
  const [users, setUsers] = useState<Account[]>([]);
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState<{ user: Account; action: string } | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/admin/users?page=${page}`, {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` }, cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) { setUsers([]); setMessage(body.error); return; }
      setUsers(body.users); setMessage("");
    } catch { setUsers([]); setMessage("User administration unavailable."); }
    finally { setBusy(false); }
  }, [page]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function perform() {
    if (!pending || confirmation !== pending.user.user_id) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ userId: pending.user.user_id, action: pending.action, confirmation }),
      });
      const body = await response.json();
      if (!response.ok) { setMessage(body.error); return; }
      const deletion = pending.action === "request_deletion";
      setPending(null); setConfirmation(""); await load();
      if (deletion) setMessage("Access suspended. Deletion review recorded; no data or Auth account has been deleted.");
    } catch { setMessage("Action could not be confirmed. Reload account status before retrying."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-5xl space-y-6 px-6 py-12 text-white">
    <Link href="/dashboard" className="text-violet-300">Back to dashboard</Link>
    <h1 className="text-2xl font-semibold">User administration</h1>
    <p className="text-slate-400">Owner access only. Usage months use UTC. Deletion requests suspend access and require a separate privacy review.</p>
    <p role="status">{message}</p>
    {users.map(user => <section key={user.user_id} className="space-y-2 rounded-xl border border-white/10 p-4">
      <h2>{user.email || "No email"}{user.owner_administrator ? " · Owner administrator" : ""}</h2>
      <p className="break-all text-sm text-slate-400">{user.user_id}</p>
      <p>{user.suspended ? "Suspended" : "Active"} · {user.verified ? "Verified" : "Unverified or Auth restricted"}{user.deletion_requested_at ? " · Deletion review pending" : ""}</p>
      <p>Scans this month: {user.scans_this_month}; Discovery generations: {user.discoveries_this_month}. Historical Scan counter: {user.scans_used ?? 0}; plan limit: {user.scan_limit ?? 0}.</p>
      {!user.owner_administrator && <div className="flex gap-4">
        <button disabled={busy || !!user.deletion_requested_at} onClick={() => { setPending({ user, action: user.suspended ? "reactivate" : "suspend" }); setConfirmation(""); }} className="text-violet-300 disabled:opacity-50">{user.suspended ? "Re-enable" : "Suspend"}</button>
        <button disabled={busy || !!user.deletion_requested_at} onClick={() => { setPending({ user, action: "request_deletion" }); setConfirmation(""); }} className="text-red-300 disabled:opacity-50">Request deletion review</button>
      </div>}
    </section>)}
    {pending && <section className="space-y-3 rounded-xl border border-violet-500 p-4">
      <p>Confirm {pending.action} for {pending.user.email}. Paste the account UUID to confirm.</p>
      <input aria-label="Confirm account UUID" className="w-full rounded bg-slate-900 p-2" value={confirmation} onChange={event => setConfirmation(event.target.value)} />
      <button disabled={busy || confirmation !== pending.user.user_id} onClick={() => void perform()} className="mr-4 text-violet-300 disabled:opacity-50">Confirm action</button>
      <button disabled={busy} onClick={() => setPending(null)}>Cancel</button>
    </section>}
    <div className="flex items-center gap-4">
      <button disabled={busy || page === 1} onClick={() => setPage(value => value - 1)}>Previous</button>
      <span>Page {page}</span><button disabled={busy || users.length < 50} onClick={() => setPage(value => value + 1)}>Next</button>
    </div>
  </main>;
}
