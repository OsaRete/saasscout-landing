import type { SnapshotRetrievalCandidate, SnapshotRetrievalQuery } from "./types.ts";
import { normalizeSnapshotRetrievalQuery } from "./ranker.ts";

export interface SnapshotRetrievalRepository {
  findCandidates(query: SnapshotRetrievalQuery): Promise<readonly SnapshotRetrievalCandidate[]>;
}

export class InMemorySnapshotRetrievalRepository implements SnapshotRetrievalRepository {
  private readonly candidates: readonly SnapshotRetrievalCandidate[];

  constructor(candidates: readonly SnapshotRetrievalCandidate[]) {
    this.candidates = candidates;
  }

  async findCandidates(query: SnapshotRetrievalQuery): Promise<readonly SnapshotRetrievalCandidate[]> {
    const normalized = normalizeSnapshotRetrievalQuery(query);
    return this.candidates
      .filter((candidate) => {
        if (query.discoveryId != null && candidate.ownership.discoveryId !== query.discoveryId) return false;
        if (query.userId != null && candidate.ownership.userId !== query.userId) return false;
        if (query.organizationId !== undefined && candidate.ownership.organizationId !== query.organizationId) return false;
        return true;
      })
      .slice(0, normalized.maxCandidates);
  }
}
