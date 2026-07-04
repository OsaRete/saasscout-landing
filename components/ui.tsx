import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "violet" | "cyan" | "green" | "neutral" | "red";

type ButtonProps = {
  children: ReactNode;
  className?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "cyan";
};

const buttonVariants = {
  primary:
    "bg-violet-600 text-white shadow-lg shadow-violet-600/20 hover:bg-violet-500",
  secondary:
    "border border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07] hover:text-white",
  ghost: "text-violet-300 hover:bg-violet-500/10 hover:text-violet-200",
  cyan:
    "border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20",
};

export function Button({
  children,
  className = "",
  href,
  onClick,
  disabled,
  variant = "primary",
}: ButtonProps) {
  const classes = `inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition ${buttonVariants[variant]} disabled:cursor-not-allowed disabled:opacity-60 ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "violet",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const tones: Record<Tone, string> = {
    violet: "border-violet-500/30 bg-violet-500/10 text-violet-200",
    cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
    green: "border-green-500/30 bg-green-500/10 text-green-200",
    red: "border-red-500/30 bg-red-500/10 text-red-200",
    neutral: "border-white/10 bg-white/[0.04] text-gray-300",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Panel({
  children,
  className = "",
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <section
      className={`rounded-[1.75rem] border p-6 shadow-2xl shadow-black/20 ${
        accent
          ? "border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-[#0B1020] to-cyan-500/10"
          : "border-white/10 bg-[#0B1020]/90"
      } ${className}`}
    >
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  helper,
  tone = "violet",
}: {
  label: string;
  value: ReactNode;
  helper?: string;
  tone?: Tone;
}) {
  const helperTone: Record<Tone, string> = {
    violet: "text-violet-300",
    cyan: "text-cyan-300",
    green: "text-green-300",
    red: "text-red-300",
    neutral: "text-gray-400",
  };

  return (
    <div className="group rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-6 shadow-xl shadow-black/10 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.065]">
      <p className="text-sm font-medium text-gray-400">{label}</p>
      <h2 className="mt-3 text-4xl font-bold tracking-tight text-white">
        {value}
      </h2>
      {helper && (
        <p className={`mt-2 text-sm ${helperTone[tone]}`}>{helper}</p>
      )}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.24),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.07),rgba(8,13,32,0.9))] px-8 py-8 shadow-2xl shadow-black/25">
      <div className="absolute right-8 top-8 h-28 w-28 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-300">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white md:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-400">
            {description}
          </p>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        )}
      </div>
    </header>
  );
}

export function LoadingState({
  title = "Loading SaaSScout",
  description = "Preparing market intelligence...",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050816] px-6 text-white">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0B1020]/95 p-8 text-center shadow-2xl shadow-violet-950/20">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-400/30 bg-violet-500/10">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-200/30 border-t-cyan-200" />
        </div>
        <h1 className="mt-5 text-xl font-bold tracking-tight text-white">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-400">{description}</p>
      </div>
    </div>
  );
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <div className="h-4 w-2/5 animate-pulse rounded-full bg-white/10" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="h-3 animate-pulse rounded-full bg-gradient-to-r from-white/10 via-violet-300/10 to-cyan-300/10"
            style={{ width: `${92 - index * 14}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  icon = "✦",
  title,
  description,
  primaryAction,
  secondaryAction,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.14),transparent_38%),#0B1020] p-10 text-center shadow-2xl shadow-black/20 ${className}`}>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 text-2xl text-cyan-200">
        {icon}
      </div>
      <h2 className="mt-5 text-2xl font-bold text-white">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-gray-400">{description}</p>
      {(primaryAction || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  className = "",
}: {
  tone?: "success" | "error" | "warning" | "info";
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    success: "border-green-400/30 bg-green-400/10 text-green-100",
    error: "border-red-400/30 bg-red-400/10 text-red-100",
    warning: "border-amber-300/30 bg-amber-300/10 text-amber-100",
    info: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100",
  };
  const icons = { success: "✓", error: "!", warning: "!", info: "i" };

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm shadow-lg shadow-black/10 ${tones[tone]} ${className}`}>
      <div className="flex gap-3">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current/30 text-[11px] font-bold">
          {icons[tone]}
        </span>
        <div>
          {title && <p className="font-semibold text-white">{title}</p>}
          <div className={title ? "mt-1 leading-relaxed" : "leading-relaxed"}>{children}</div>
        </div>
      </div>
    </div>
  );
}
