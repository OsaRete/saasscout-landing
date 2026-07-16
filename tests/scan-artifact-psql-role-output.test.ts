import assert from "node:assert/strict";
import test from "node:test";
import { stripScanArtifactRoleMarker } from "./support/scan-artifact-psql-role-output.ts";

test("scan artifact role parser tolerates legacy psql command tags around payload", () => {
  assert.equal(
    stripScanArtifactRoleMarker("SET\n__SCAN_TEST_ROLE__=service_role\n{\"status\":\"inserted\"}\nRESET\n", "service_role"),
    "{\"status\":\"inserted\"}",
  );
});

test("scan artifact role parser removes only the marked role line", () => {
  assert.equal(
    stripScanArtifactRoleMarker("__SCAN_TEST_ROLE__=authenticated\n{\"sel\":false}\n", "authenticated"),
    "{\"sel\":false}",
  );
});

test("scan artifact role parser tolerates Windows CRLF output", () => {
  assert.equal(
    stripScanArtifactRoleMarker("SET\r\n\r\n__SCAN_TEST_ROLE__=postgres\r\n{\"status\":\"replayed\"}\r\nRESET\r\n", "postgres"),
    "{\"status\":\"replayed\"}",
  );
});
