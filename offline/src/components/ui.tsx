import { Link } from "react-router-dom";
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

export function Card({ children, className = "", pad = true }: {
  children: ReactNode; className?: string; pad?: boolean;
}) {
  return <div className={`card ${pad ? "card-pad" : ""} ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: ReactNode;
}) {
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
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge ${TONES[tone]}`}>{children}</span>;
}

export function EmptyState({ icon = "🍌", title, detail, action }: {
  icon?: string; title: string; detail?: string; action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="text-4xl" aria-hidden>{icon}</span>
      <p className="font-semibold text-ink-800">{title}</p>
      {detail && <p className="max-w-xs text-sm text-ink-500">{detail}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = "neutral", to, icon }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; to?: string; icon?: string;
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
  return to ? <Link to={to} className="block active:scale-[.99]">{body}</Link> : body;
}

export function Field({ label, hint, error, children, required }: {
  label?: string; hint?: string; error?: string; children: ReactNode; required?: boolean;
}) {
  // Associação explícita por id. Com o <label> envolvendo o campo, o nome lido
  // por leitores de tela acabava incluindo a dica e até o texto de todas as
  // opções de um <select>.
  const generated = useId();
  const child = isValidElement(children) ? (children as ReactElement<Record<string, unknown>>) : null;
  const id = (child?.props?.id as string | undefined) ?? generated;
  const hintId = hint || required ? `${id}-ajuda` : undefined;

  const control = child
    ? cloneElement(child, {
        id,
        ...(hintId ? { "aria-describedby": hintId } : {}),
        ...(required ? { "aria-required": true } : {}),
      })
    : children;

  return (
    <div className="field">
      {label && <label htmlFor={id} className="label">{label}</label>}
      {control}
      {!error && (hint || required) && (
        <span id={hintId} className="hint">
          {required && <span className="font-semibold text-ink-600">Obrigatório</span>}
          {required && hint ? " · " : ""}
          {hint}
        </span>
      )}
      {error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}
    </div>
  );
}

export function Message({ error, success, info }: {
  error?: string | null; success?: string | null; info?: string | null;
}) {
  if (!error && !success && !info) return null;
  const tone = error
    ? "bg-red-50 text-red-700 ring-red-200"
    : success
      ? "bg-leaf-50 text-leaf-700 ring-leaf-300"
      : "bg-sky-50 text-sky-800 ring-sky-200";
  return (
    <div role="status" className={`rounded-xl px-3.5 py-3 text-sm font-medium ring-1 ${tone}`}>
      {error ?? success ?? info}
    </div>
  );
}

export function QuickAction({ to, icon, label, tone = "banana" }: {
  to: string; icon: string; label: string; tone?: "banana" | "leaf" | "white";
}) {
  const styles = {
    banana: "bg-banana-400 text-[#3A2C00] hover:bg-banana-500",
    leaf: "bg-leaf-600 text-white hover:bg-leaf-700",
    white: "border border-[var(--border)] bg-white text-ink-800 hover:bg-ink-50",
  }[tone];
  return (
    <Link
      to={to}
      className={`flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-2xl px-2 text-center shadow-card transition active:scale-[.97] ${styles}`}
    >
      <span className="text-2xl leading-none" aria-hidden>{icon}</span>
      <span className="text-[0.78rem] font-bold leading-tight">{label}</span>
    </Link>
  );
}

export function Row({ to, title, subtitle, right, rightSub, danger }: {
  to?: string; title: ReactNode; subtitle?: ReactNode;
  right?: ReactNode; rightSub?: ReactNode; danger?: boolean;
}) {
  const content = (
    <div className="row">
      <div className="min-w-0 flex-1">
        <div className={`truncate font-semibold ${danger ? "text-red-700" : "text-ink-900"}`}>{title}</div>
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
  return to ? <Link to={to} className="block active:bg-ink-50">{content}</Link> : content;
}

export function Spinner({ label = "Carregando..." }: { label?: string }) {
  return <p className="px-1 py-8 text-center text-sm text-ink-500">{label}</p>;
}

/** Botão que mostra estado de "processando" enquanto a ação roda. */
export function Busy({ busy, children, className = "btn-primary w-full", ...rest }: {
  busy: boolean; children: ReactNode; className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={className} disabled={busy || rest.disabled}>
      {busy ? "Aguarde..." : children}
    </button>
  );
}
