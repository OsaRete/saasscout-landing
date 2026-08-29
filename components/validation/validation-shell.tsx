import type { ReactNode } from "react";
import Link from "next/link";
export function ValidationPage({children}:{children:ReactNode}){return <main className="min-h-screen px-4 py-8 text-white sm:px-6 lg:px-10"><div className="mx-auto max-w-7xl">{children}</div></main>}
export function ContextNotice({children}:{children:ReactNode}){return <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[.06] p-4"><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-200">Context — not validation evidence</p><div className="mt-2 text-sm leading-6 text-slate-300">{children}</div></div>}
export function BackLink({href="/validation"}:{href?:string}){return <Link href={href} className="mb-6 inline-flex text-sm font-medium text-slate-400 hover:text-white">← Back to Idea Validation</Link>}
export const card="rounded-3xl border border-white/10 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/10";
