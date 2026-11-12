"use client";
import { useState } from "react";
import { Button } from "@/components/ui";
import type { PrototypeContent } from "@/lib/validation/prototypes";
export function PrototypePreview({
  content,
  mobile = false,
  onNavigate,
}: {
  content: PrototypeContent;
  mobile?: boolean;
  onNavigate?: (screen: string, target: string) => Promise<boolean>;
}) {
  const [screenId, setScreenId] = useState(content.screens[0].id);
  const [pending, setPending] = useState(false);
  const screen =
    content.screens.find((s) => s.id === screenId) || content.screens[0];
  async function navigate(target: string) {
    setPending(true);
    try {
      if (!onNavigate || (await onNavigate(screen.id, target)))
        setScreenId(target);
    } finally {
      setPending(false);
    }
  }
  return (
    <div
      className={`mx-auto w-full overflow-hidden rounded-2xl border border-white/15 bg-[#10182b] shadow-xl ${mobile ? "max-w-sm" : "max-w-4xl"}`}
    >
      <div className="flex items-center gap-3 border-b border-white/10 bg-white/[.03] px-5 py-3">
        <span aria-hidden="true" className="text-cyan-300">
          ✦
        </span>
        <span className="min-w-0 truncate text-sm font-semibold">
          {content.title}
        </span>
        <span className="ml-auto text-xs text-slate-400">Concept</span>
      </div>
      <div className="p-6 sm:p-8" aria-live="polite" aria-busy={pending}>
        <p className="text-xs uppercase tracking-wider text-cyan-300">
          {screen.layout === "confirmation"
            ? "✓ Complete"
            : screen.layout === "detail"
              ? "Review"
              : "Workspace"}
        </p>
        <h3 className="mt-3 text-2xl font-semibold text-white">
          {screen.title}
        </h3>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
          {screen.description}
        </p>
        <div
          className={`my-6 grid gap-3 ${!mobile && screen.layout === "dashboard" ? "sm:grid-cols-2" : ""}`}
        >
          {screen.labels.map((label, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/10 bg-white/[.04] p-5 text-sm text-slate-200"
            >
              <span aria-hidden="true" className="mr-3 text-cyan-300">
                {screen.layout === "confirmation" ? "✓" : "◈"}
              </span>
              {label}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {screen.actions.map((action, i) => (
            <Button
              key={i}
              disabled={pending}
              variant={i ? "secondary" : "primary"}
              onClick={() => void navigate(action.target)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>
      <p className="border-t border-white/10 px-5 py-3 text-xs text-slate-400">
        Screen {content.screens.indexOf(screen) + 1} of {content.screens.length}{" "}
        · Visual prototype · No real transaction
      </p>
    </div>
  );
}
