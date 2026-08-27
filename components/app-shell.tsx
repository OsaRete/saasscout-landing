"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";

const workspaceRoutes = ["/dashboard", "/scan", "/scans", "/discover", "/results", "/saved", "/weekly", "/opportunity", "/sources", "/founder-profile"];
const SIDEBAR_MODE_KEY = "saasscout-sidebar-mode";
const LEGACY_COLLAPSED_KEY = "saasscout-sidebar-collapsed";

type SidebarDisplayMode = "expanded" | "collapsed" | "hover";

const sidebarModes: ReadonlyArray<{ value: SidebarDisplayMode; label: string }> = [
  { value: "expanded", label: "Expanded" },
  { value: "collapsed", label: "Collapsed" },
  { value: "hover", label: "Expand on hover" },
];

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

function readStoredMode(): SidebarDisplayMode {
  const storedMode = window.localStorage.getItem(SIDEBAR_MODE_KEY);
  if (sidebarModes.some(({ value }) => value === storedMode)) return storedMode as SidebarDisplayMode;

  const legacyCollapsed = window.localStorage.getItem(LEGACY_COLLAPSED_KEY);
  const migratedMode: SidebarDisplayMode = legacyCollapsed === "true" ? "collapsed" : "expanded";
  if (legacyCollapsed === "true" || legacyCollapsed === "false") {
    window.localStorage.setItem(SIDEBAR_MODE_KEY, migratedMode);
  }
  return migratedMode;
}

export default function AppShell({ children, active }: { children: ReactNode; active?: string }) {
  const pathname = usePathname();
  const [sidebarMode, setSidebarMode] = useState<SidebarDisplayMode>("expanded");
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const modeControlRef = useRef<HTMLDivElement>(null);
  const modeButtonRef = useRef<HTMLButtonElement>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const inWorkspace = workspaceRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  useEffect(() => {
    const timer = window.setTimeout(() => setSidebarMode(readStoredMode()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setMobileOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!modeMenuOpen) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!modeControlRef.current?.contains(event.target as Node)) setModeMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModeMenuOpen(false);
        modeButtonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [modeMenuOpen]);

  useEffect(() => () => {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
  }, []);

  if (!inWorkspace || active) return children;

  const temporarilyExpanded = sidebarMode === "hover" && hoverExpanded;
  const desktopExpanded = sidebarMode === "expanded" || temporarilyExpanded;
  const compact = !desktopExpanded;

  function scheduleHoverExpansion(expanded: boolean) {
    if (sidebarMode !== "hover") return;
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => setHoverExpanded(expanded), expanded ? 160 : 200);
  }

  function handleSidebarBlur(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scheduleHoverExpansion(false);
  }

  function selectSidebarMode(mode: SidebarDisplayMode) {
    setSidebarMode(mode);
    setHoverExpanded(false);
    setModeMenuOpen(false);
    window.localStorage.setItem(SIDEBAR_MODE_KEY, mode);
    modeButtonRef.current?.focus();
  }

  function renderNavigation(expanded: boolean) {
    return <nav aria-label="Product navigation" className="mt-6 space-y-1.5">
      {navItems.map((item) => {
        const routeActive = isActiveRoute(pathname, item.href);
        return <div key={item.href}>
          {item.separated && <div className="my-4 h-px bg-white/8" />}
          <Link href={item.href} title={!expanded ? item.label : undefined} aria-label={!expanded ? item.label : undefined} aria-current={routeActive ? "page" : undefined} className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors ${routeActive ? "bg-violet-500/14 text-white ring-1 ring-inset ring-violet-400/25" : "text-slate-400 hover:bg-white/[0.045] hover:text-slate-100"} ${!expanded ? "justify-center" : ""}`}>
            {routeActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-cyan-300" />}
            <NavIcon name={item.icon} />
            {expanded && <span className="truncate">{item.label}</span>}
          </Link>
        </div>;
      })}
    </nav>;
  }

  return <div className="min-h-screen bg-[#050711] text-white">
    <aside
      data-sidebar-mode={sidebarMode}
      data-temporarily-expanded={temporarilyExpanded}
      onPointerEnter={() => scheduleHoverExpansion(true)}
      onPointerLeave={() => scheduleHoverExpansion(false)}
      onFocusCapture={() => scheduleHoverExpansion(true)}
      onBlurCapture={handleSidebarBlur}
      className={`fixed inset-y-0 left-0 z-40 hidden border-r border-white/8 bg-[#080b15]/95 px-3 py-5 shadow-2xl shadow-black/30 backdrop-blur-xl transition-[width] duration-200 lg:flex lg:flex-col ${desktopExpanded ? "w-64" : "w-[76px]"} ${temporarilyExpanded ? "shadow-black/60" : ""}`}
    >
      <div className={`flex h-10 items-center ${compact ? "justify-center" : "px-2"}`}>
        <Link href="/dashboard" aria-label="SaaSScout dashboard">
          {compact ? <Image src="/brand/archive.png" alt="" width={34} height={34} className="h-8 w-8 rounded-lg" /> : <Image src="/brand/logo-main.png" alt="SaaSScout" width={164} height={44} className="h-9 w-auto" />}
        </Link>
      </div>
      {renderNavigation(desktopExpanded)}
      <div ref={modeControlRef} className="relative mt-auto">
        {modeMenuOpen && <div role="menu" aria-label="Sidebar behavior" className="absolute bottom-[calc(100%+8px)] left-0 w-56 rounded-xl border border-white/10 bg-[#0c1020] p-2 shadow-2xl shadow-black/50">
          <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Sidebar behavior</p>
          {sidebarModes.map((mode) => <button
            key={mode.value}
            type="button"
            role="menuitemradio"
            aria-checked={sidebarMode === mode.value}
            onClick={() => selectSidebarMode(mode.value)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-slate-300 outline-none transition hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <span aria-hidden="true" className={`grid h-4 w-4 place-items-center rounded-full border ${sidebarMode === mode.value ? "border-cyan-300" : "border-slate-600"}`}>
              {sidebarMode === mode.value && <span className="h-2 w-2 rounded-full bg-cyan-300" />}
            </span>
            {mode.label}
          </button>)}
        </div>}
        <button ref={modeButtonRef} type="button" onClick={() => setModeMenuOpen((open) => !open)} aria-label="Sidebar behavior" aria-haspopup="menu" aria-expanded={modeMenuOpen} title="Sidebar behavior" className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-slate-400 outline-none transition hover:bg-white/[0.045] hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400 ${compact ? "justify-center" : ""}`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M14 8h4M14 12h4M14 16h4"/></svg>
          {!compact && <span>Sidebar behavior</span>}
        </button>
      </div>
    </aside>

    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/8 bg-[#080b15]/95 px-4 backdrop-blur lg:hidden">
      <Link href="/dashboard"><Image src="/brand/logo-main.png" alt="SaaSScout" width={145} height={40} className="h-8 w-auto" /></Link>
      <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open product navigation" aria-expanded={mobileOpen} className="rounded-xl border border-white/10 p-2.5 text-slate-200"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" stroke="currentColor"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    </header>
    {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-black/70" aria-label="Close product navigation" onClick={() => setMobileOpen(false)} /><aside className="absolute inset-y-0 left-0 w-[min(86vw,320px)] border-r border-white/10 bg-[#080b15] p-5"><div className="flex items-center justify-between"><Image src="/brand/logo-main.png" alt="SaaSScout" width={150} height={42} className="h-9 w-auto"/><button aria-label="Close product navigation" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-slate-300">✕</button></div>{renderNavigation(true)}</aside></div>}
    <div data-sidebar-layout={sidebarMode === "expanded" ? "expanded" : "compact"} className={`min-w-0 transition-[margin] duration-200 ${sidebarMode === "expanded" ? "lg:ml-64" : "lg:ml-[76px]"}`}><div className="min-h-screen bg-[radial-gradient(circle_at_80%_0%,rgba(76,92,220,.09),transparent_28%)]">{children}</div></div>
  </div>;
}
