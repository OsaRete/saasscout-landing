import assert from "node:assert/strict";

export const SCAN_ARTIFACT_ROLE_MARKER = "__SCAN_TEST_ROLE__=";

export const SCAN_ARTIFACT_TEST_ROLES = ["postgres", "anon", "authenticated", "service_role"] as const;

export type ScanArtifactTestRole = (typeof SCAN_ARTIFACT_TEST_ROLES)[number];

const allowedRoles = new Set<string>(SCAN_ARTIFACT_TEST_ROLES);

export function assertScanArtifactTestRole(role: string): asserts role is ScanArtifactTestRole {
  assert.ok(allowedRoles.has(role), `unsupported scan artifact test role: ${role}`);
}

export function stripScanArtifactRoleMarker(out: string, role?: ScanArtifactTestRole) {
  const normalizedLines = out.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  if (!role) return normalizedLines.join("\n").trim();

  let actualRole: string | undefined;
  const payloadLines: string[] = [];

  for (const rawLine of normalizedLines) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (line.startsWith(SCAN_ARTIFACT_ROLE_MARKER)) {
      assert.equal(actualRole, undefined, `psql role marker should be emitted once for requested role ${role}`);
      actualRole = line.slice(SCAN_ARTIFACT_ROLE_MARKER.length);
      continue;
    }
    if (line === "SET" || line === "RESET") continue;
    payloadLines.push(rawLine);
  }

  assert.equal(actualRole, role, `psql current_user should match requested role ${role}`);
  return payloadLines.join("\n").trim();
}
