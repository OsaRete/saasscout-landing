import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mapAuthoritativeWeeklyToDashboard } from "../lib/weekly-intelligence.ts";

const shell = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const rootLayout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("persistent workspace exposes exactly three desktop display modes", () => {
  for (const label of ["Dashboard", "New Scan", "Discover Opportunities", "Scan History", "Opportunities", "Saved Ideas", "Weekly Intelligence"]) assert.match(shell, new RegExp(label));
  assert.match(rootLayout, /<AppShell>\{children\}<\/AppShell>/);
  assert.match(shell, /type SidebarDisplayMode = "expanded" \| "collapsed" \| "hover"/);
  assert.deepEqual([...shell.matchAll(/value: "(expanded|collapsed|hover)"/g)].map((match) => match[1]), ["expanded", "collapsed", "hover"]);
  assert.match(shell, /data-sidebar-mode=\{sidebarMode\}/);
  assert.match(shell, /data-sidebar-layout=\{sidebarMode === "expanded" \? "expanded" : "compact"\}/);
  assert.match(shell, /aria-current=\{routeActive \? "page"/);
  assert.match(shell, /title=\{!expanded \? item\.label/);
  assert.match(shell, /aria-label=\{!expanded \? item\.label/);
});

test("sidebar modes persist locally and safely migrate the legacy boolean", () => {
  assert.match(shell, /saasscout-sidebar-mode/);
  assert.match(shell, /saasscout-sidebar-collapsed/);
  assert.match(shell, /legacyCollapsed === "true" \? "collapsed" : "expanded"/);
  assert.match(shell, /window\.localStorage\.setItem\(SIDEBAR_MODE_KEY, mode\)/);
  assert.doesNotMatch(shell, /fetch\(|supabase|service[_-]?role|generate-weekly-report|auth\./i);
});

test("hover mode expands temporarily without changing its compact content layout", () => {
  assert.match(shell, /sidebarMode === "hover" && hoverExpanded/);
  assert.match(shell, /expanded \? 160 : 200/);
  assert.match(shell, /onPointerEnter=\{\(\) => scheduleHoverExpansion\(true\)\}/);
  assert.match(shell, /onFocusCapture=\{\(\) => scheduleHoverExpansion\(true\)\}/);
  assert.match(shell, /data-temporarily-expanded=\{temporarilyExpanded\}/);
  assert.match(shell, /sidebarMode === "expanded" \? "lg:ml-64" : "lg:ml-\[76px\]"/);
  assert.doesNotMatch(shell, /setSidebarMode\("expanded"\)/);
});

test("sidebar behavior control and mobile drawer preserve accessible navigation", () => {
  assert.match(shell, /aria-label="Sidebar behavior" aria-haspopup="menu" aria-expanded=\{modeMenuOpen\}/);
  assert.match(shell, /role="menu" aria-label="Sidebar behavior"/);
  assert.match(shell, /role="menuitemradio"/);
  assert.match(shell, /aria-checked=\{sidebarMode === mode\.value\}/);
  assert.match(shell, /event\.key === "Escape"/);
  assert.match(shell, /Open product navigation/);
  assert.match(shell, /Close product navigation/);
  assert.match(shell, /href=\{item\.href\}/);
  assert.match(shell, /\{renderNavigation\(true\)\}/);
});

test("dashboard has truthful empty and partial intelligence states", () => {
  assert.match(dashboard, /No scans yet/);
  assert.match(dashboard, /No saved ideas yet/);
  assert.match(dashboard, /Weekly market intelligence will appear here once the first report is generated/);
  assert.match(dashboard, /Collection semantics were not stored for this report/);
  assert.doesNotMatch(dashboard, /Strongest trend:/);
  assert.match(dashboard, /High scores do not imply growth/);
});

test("latest Weekly projection preserves collected-versus-used semantics", () => {
  const result = mapAuthoritativeWeeklyToDashboard({
    id: "run-1", period_start: "2026-08-17", period_end: "2026-08-24", summary: "Grounded report",
    total_sources_analyzed: 12, external_sources_persisted: 41, execution_mode: "mixed",
    external_provider_state: "healthy", execution_contract_version: "weekly-execution@1",
  }, [{ id: "p-1", run_id: "run-1", problem_title: "Manual reconciliation", affected_niches: "Finance operations", pain_score: 8, trend_score: 7 }]);
  assert.equal(result.weeklyReport?.total_sources_analyzed, 12);
  assert.equal(result.weeklyReport?.external_sources_persisted, 41);
  assert.equal(result.weeklyNiches[0]?.movement, null);
});

test("dashboard load remains presentation-only and does not expose privileged Weekly access", () => {
  assert.doesNotMatch(dashboard, /weekly_sources/);
  assert.doesNotMatch(dashboard, /service[_-]?role/i);
  assert.doesNotMatch(dashboard, /generate-weekly-report|generateWeekly|runWeekly/i);
});
