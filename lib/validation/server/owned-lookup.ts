type OwnedLookupResult<T> = {
  data: T | null;
  error: unknown;
};

export type OwnedLookupClassification<T> =
  { ok: true; data: T } | { ok: false; failure: "not_found" | "lookup_failed" };

export function classifyOwnedLookup<T>({
  data,
  error,
}: OwnedLookupResult<T>): OwnedLookupClassification<T> {
  if (error) return { ok: false, failure: "lookup_failed" };
  if (!data) return { ok: false, failure: "not_found" };
  return { ok: true, data };
}
