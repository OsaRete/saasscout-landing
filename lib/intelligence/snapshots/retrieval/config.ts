import type { SnapshotRetrievalMode } from "./types.ts";

export type SupportedSnapshotRetrievalMode = Extract<SnapshotRetrievalMode, "disabled" | "shadow">;

export function parseSnapshotRetrievalMode(value: string | undefined): SupportedSnapshotRetrievalMode {
  if (value === "disabled" || value === "shadow") return value;
  return "disabled";
}

export function getSnapshotRetrievalMode(): SupportedSnapshotRetrievalMode {
  return parseSnapshotRetrievalMode(process.env.SNAPSHOT_RETRIEVAL_MODE);
}
