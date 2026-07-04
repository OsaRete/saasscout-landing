import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/scan", label: "New Scan" },
  { href: "/discover", label: "Discover Opportunities" },
  { href: "/scans", label: "Scan History" },
  { href: "/results", label: "Opportunities" },
  { href: "/saved", label: "Saved Ideas" },
  { href: "/weekly", label: "Weekly Intelligence", separated: true },
];

export default function AppShell({
  children,
  active = "/dashboard",
}: {
  children: ReactNode;
  active?: string;
}) {
  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="flex min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.08),transparent_28%),radial-gradient(circle_at_20%_10%,rgba(124,58,237,0.14),transparent_30%)]">
        <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-[#070B18]/85 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl lg:block">
          <Link href="/dashboard" className="flex items-center">
            <Image
              src="/brand/logo-main.png"
              alt="SaaSScout"
              width={170}
              height={48}
              className="h-10 w-auto"
            />
          </Link>

          <div className="mt-8 rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
              Intelligence OS
            </p>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">
              Evidence, signals, and market knowledge in one workspace.
            </p>
          </div>

          <nav className="mt-8 space-y-1.5 text-sm text-gray-400">
            {navItems.map((item) => (
              <div key={item.href}>
                {item.separated && <div className="my-4 h-px bg-white/10" />}
                <Link
                  href={item.href}
                  className={`group flex items-center justify-between rounded-2xl px-4 py-3 transition ${
                    active === item.href
                      ? "border border-violet-500/25 bg-violet-600/20 font-semibold text-white shadow-lg shadow-violet-950/20"
                      : "hover:bg-white/[0.055] hover:text-white"
                  }`}
                >
                  <span>{item.label}</span>
                  {active === item.href && (
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                  )}
                </Link>
              </div>
            ))}
          </nav>
        </aside>

        <section className="flex-1 px-6 py-8 lg:px-10">{children}</section>
      </div>
    </main>
  );
}
