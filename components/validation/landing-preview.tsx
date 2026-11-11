import type { LandingPublicContent } from "@/lib/validation/landing-pages";
export function LandingPreview({
  content,
  children,
}: {
  content: LandingPublicContent;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-3xl border border-white/10 bg-[#0b1020] p-6 text-white sm:p-12 ${content.template === "minimal" ? "max-w-2xl mx-auto" : ""}`}
    >
      <div
        className={
          content.template === "benefits"
            ? "grid gap-10 md:grid-cols-2"
            : "mx-auto max-w-2xl text-center"
        }
      >
        <div>
          {content.visual && (
            <div aria-hidden="true" className="mb-6 text-6xl text-cyan-300">
              {content.visual}
            </div>
          )}
          <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">
            An idea worth exploring
          </p>
          <h1 className="mt-4 break-words text-3xl font-bold tracking-tight sm:text-5xl">
            {content.headline}
          </h1>
          <p className="mt-6 whitespace-pre-wrap break-words text-base leading-7 text-slate-300">
            {content.description}
          </p>
        </div>
        <div>
          <ul className="my-8 space-y-3 text-left">
            {content.benefits.map((b, i) => (
              <li key={i} className="flex gap-3 rounded-xl bg-white/5 p-4">
                <span aria-hidden="true" className="text-cyan-300">
                  ✓
                </span>
                <span className="break-words">{b}</span>
              </li>
            ))}
          </ul>
          {children || (
            <button
              type="button"
              disabled
              className="w-full rounded-xl bg-cyan-300 px-6 py-4 font-bold text-slate-950"
            >
              {content.cta}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
