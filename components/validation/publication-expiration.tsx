export function PublicationExpiration({ expiresAt }: { expiresAt?: string }) {
  if (!expiresAt) return null;
  const timestamp = new Date(expiresAt);
  const utc = timestamp.toISOString();

  return (
    <p className="mt-2 text-sm text-slate-400">
      Link expiration{" "}
      <time dateTime={utc}>{utc.slice(0, 19).replace("T", " ")} UTC</time>. You
      can close the link earlier.
    </p>
  );
}
