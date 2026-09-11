import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, className = "", pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <div className={`card ${pad ? "card-pad" : ""} ${className}`}>{children}</div>;
}

export function PageHeader({
  title, subtitle, action,
}: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between gap-2 first:mt-0">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">{children}</h2>
      {action}
    </div>
  );
}

const TONES = {
  neutral: "bg-ink-100 text-ink-700",
  green: "bg-leaf-100 text-leaf-700",
  yellow: "bg-banana-100 text-banana-800",
  red: "bg-red-100 text-red-700",
  blue: "bg-sky-100 text-sky-700",
  purple: "bg-violet-100 text-violet-700",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge ${TONES[tone]}`}>{children}</span>;
}

export function EmptyState({
  icon = "🍌", title, detail, action,
}: { icon?: string; title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="text-4xl" aria-hidden>{icon}</span>
      <p className="font-semibold text-ink-800">{title}</p>
      {detail && <p className="max-w-xs text-sm text-ink-500">{detail}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function StatCard({
  label, value, hint, tone = "neutral", href, icon,
}: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; href?: string; icon?: string;
}) {
  const body = (
    <div className="card card-pad h-full">
      <div className="flex items-start gap-1.5 text-xs font-semibold uppercase leading-tight tracking-wide text-ink-500">
        {icon && <span aria-hidden className="leading-none">{icon}</span>}
        <span>{label}</span>
      </div>
      <div className={`mt-1.5 text-[1.35rem] font-bold leading-tight ${
        tone === "red" ? "text-red-600" : tone === "green" ? "text-leaf-700" : "text-ink-900"
      }`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-ink-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block active:scale-[.99]">{body}</Link> : body;
}

/** Reexportado de field.tsx: usa hook e precisa ser componente de cliente. */
export { Field } from "./field";

export function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (!error && !success) return null;
  return (
    <div
      role="status"
      className={`rounded-xl px-3.5 py-3 text-sm font-medium ${
        error ? "bg-red-50 text-red-700 ring-1 ring-red-200" : "bg-leaf-50 text-leaf-700 ring-1 ring-leaf-300"
      }`}
    >
      {error ?? success}
    </div>
  );
}

export function ListRow({
  href, title, subtitle, right, rightSub, tone,
}: {
  href?: string; title: ReactNode; subtitle?: ReactNode;
  right?: ReactNode; rightSub?: ReactNode; tone?: "danger";
}) {
  const content = (
    <div className="row">
      <div className="min-w-0 flex-1">
        <div className={`truncate font-semibold ${tone === "danger" ? "text-red-700" : "text-ink-900"}`}>{title}</div>
        {subtitle && <div className="mt-0.5 truncate text-sm text-ink-500">{subtitle}</div>}
      </div>
      {(right || rightSub) && (
        <div className="shrink-0 text-right">
          <div className="font-semibold tabular-nums text-ink-900">{right}</div>
          {rightSub && <div className="text-xs text-ink-500">{rightSub}</div>}
        </div>
      )}
    </div>
  );
  return href ? <Link href={href} className="block active:bg-ink-50">{content}</Link> : content;
}

export function QuickAction({ href, icon, label, tone = "banana" }: {
  href: string; icon: string; label: string; tone?: "banana" | "leaf" | "white";
}) {
  const styles = {
    banana: "bg-banana-400 text-[#3A2C00] hover:bg-banana-500",
    leaf: "bg-leaf-600 text-white hover:bg-leaf-700",
    white: "border border-[var(--border)] bg-white text-ink-800 hover:bg-ink-50",
  }[tone];
  return (
    <Link
      href={href}
      className={`flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-2xl px-2 text-center shadow-card transition active:scale-[.97] ${styles}`}
    >
      <span className="text-2xl leading-none" aria-hidden>{icon}</span>
      <span className="text-[0.78rem] font-bold leading-tight">{label}</span>
    </Link>
  );
}

export function Money({ value, className = "" }: { value: string; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{value}</span>;
}
