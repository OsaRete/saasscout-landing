"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const workspaceRoutes = ["/dashboard", "/scan", "/scans", "/discover", "/results", "/saved", "/weekly", "/opportunity", "/sources", "/founder-profile"];

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "grid", separated: false },
  { href: "/scan", label: "New Scan", icon: "scan", separated: false },
  { href: "/discover", label: "Discover Opportunities", icon: "compass", separated: false },
  { href: "/scans", label: "Scan History", icon: "history", separated: false },
  { href: "/results", label: "Opportunities", icon: "signal", separated: false },
  { href: "/saved", label: "Saved Ideas", icon: "bookmark", separated: false },
  { href: "/weekly", label: "Weekly Intelligence", icon: "pulse", separated: true },
] as const;

function NavIcon({ name }: { name: (typeof navItems)[number]["icon"] }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    scan: <><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/><path d="M8 12h8M12 8v8"/></>,
    compass: <><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    signal: <><path d="M4 19V9M10 19V5M16 19v-7M22 19V3"/></>,
    bookmark: <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4V4Z"/>,
    pulse: <><path d="M3 12h4l2.2-6 4.2 12 2.1-6H21"/><path d="M4 4h16v16H4z" opacity=".25"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function isActiveRoute(pathname: string, href: string) {
  if (href === "/results") return pathname === href || pathname.startsWith("/opportunity/") || pathname === "/sources";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell({ children, active }: { children: ReactNode; active?: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const inWorkspace = workspaceRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  useEffect(() => {
    const timer = window.setTimeout(() => setCollapsed(window.localStorage.getItem("saasscout-sidebar-collapsed") === "true"), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setMobileOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  if (!inWorkspace || active) return children;

  function toggleCollapsed() {
    setCollapsed((current) => {
      window.localStorage.setItem("saasscout-sidebar-collapsed", String(!current));
      return !current;
    });
  }

  const navigation = (
    <nav aria-label="Product navigation" className="mt-6 space-y-1.5">
      {navItems.map((item) => {
        const active = isActiveRoute(pathname, item.href);
        return <div key={item.href}>
          {item.separated && <div className="my-4 h-px bg-white/8" />}
          <Link href={item.href} title={collapsed ? item.label : undefined} aria-label={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined} className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors ${active ? "bg-violet-500/14 text-white ring-1 ring-inset ring-violet-400/25" : "text-slate-400 hover:bg-white/[0.045] hover:text-slate-100"} ${collapsed ? "justify-center" : ""}`}>
            {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-cyan-300" />}
            <NavIcon name={item.icon} />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        </div>;
      })}
    </nav>
  );

  return <div className="min-h-screen bg-[#050711] text-white">
    <aside data-collapsed={collapsed} className={`fixed inset-y-0 left-0 z-40 hidden border-r border-white/8 bg-[#080b15]/95 px-3 py-5 shadow-2xl shadow-black/30 backdrop-blur-xl transition-[width] duration-200 lg:flex lg:flex-col ${collapsed ? "w-[76px]" : "w-64"}`}>
      <div className={`flex h-10 items-center ${collapsed ? "justify-center" : "px-2"}`}>
        <Link href="/dashboard" aria-label="SaaSScout dashboard">
          {collapsed ? <Image src="/brand/archive.png" alt="" width={34} height={34} className="h-8 w-8 rounded-lg" /> : <Image src="/brand/logo-main.png" alt="SaaSScout" width={164} height={44} className="h-9 w-auto" />}
        </Link>
      </div>
      {navigation}
      <button type="button" onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} className={`mt-auto flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-slate-400 transition hover:bg-white/[0.045] hover:text-white ${collapsed ? "justify-center" : ""}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-5 w-5 transition-transform ${collapsed ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m15 18-6-6 6-6"/><rect x="3" y="3" width="18" height="18" rx="3"/></svg>
        {!collapsed && <span>Collapse sidebar</span>}
      </button>
    </aside>

    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/8 bg-[#080b15]/95 px-4 backdrop-blur lg:hidden">
      <Link href="/dashboard"><Image src="/brand/logo-main.png" alt="SaaSScout" width={145} height={40} className="h-8 w-auto" /></Link>
      <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open product navigation" aria-expanded={mobileOpen} className="rounded-xl border border-white/10 p-2.5 text-slate-200"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" stroke="currentColor"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    </header>
    {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-black/70" aria-label="Close product navigation" onClick={() => setMobileOpen(false)} /><aside className="absolute inset-y-0 left-0 w-[min(86vw,320px)] border-r border-white/10 bg-[#080b15] p-5"><div className="flex items-center justify-between"><Image src="/brand/logo-main.png" alt="SaaSScout" width={150} height={42} className="h-9 w-auto"/><button aria-label="Close product navigation" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-slate-300">✕</button></div>{navigation}</aside></div>}
    <div className={`min-w-0 transition-[margin] duration-200 ${collapsed ? "lg:ml-[76px]" : "lg:ml-64"}`}><div className="min-h-screen bg-[radial-gradient(circle_at_80%_0%,rgba(76,92,220,.09),transparent_28%)]">{children}</div></div>
  </div>;
}
