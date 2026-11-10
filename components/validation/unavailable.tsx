export function ValidationUnavailable() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-3xl font-semibold">Validation is unavailable</h1>
      <p className="mt-4">Validation is unavailable in this release.</p>
      <a className="mt-6 inline-block underline" href="/dashboard">
        Return to dashboard
      </a>
    </main>
  );
}
