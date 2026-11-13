const workspaceRoutes = ["/dashboard", "/scan", "/scans", "/discover", "/results", "/saved", "/weekly", "/validation", "/opportunity", "/sources", "/founder-profile"];

export function isPublicValidationPath(pathname: string): boolean {
  return ["survey", "commercial-intent", "external-mvp", "landing", "prototype"]
    .some((family) => pathname.startsWith(`/validation/${family}/`));
}

export function isFounderWorkspacePath(pathname: string): boolean {
  return !isPublicValidationPath(pathname) && workspaceRoutes
    .some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
