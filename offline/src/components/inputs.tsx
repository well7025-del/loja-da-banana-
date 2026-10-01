import { useEffect, useRef, useState, type ReactNode } from "react";
import { PERIOD_OPTIONS, resolvePeriod, type Period, type PeriodKey } from "@/lib/period";
import { humanSize, pickFile } from "@/logic/files";
import { DOCUMENT_ACCEPT } from "@/logic/attachments";

/** Copia um texto para a área de transferência, com saída para WebView antigo. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Cai no método antigo abaixo.
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Caixa com um texto longo e o botão de copiar — usada no Pix copia e cola. */
export function CopyBox({ label, value, hint, mono = true }: {
  label: string; value: string; hint?: string; mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const ok = await copyToClipboard(value);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2200);
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-ink-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</span>
        <button type="button" onClick={() => void copy()}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
            copied ? "bg-leaf-600 text-white" : "bg-white text-leaf-700 ring-1 ring-[var(--border)]"
          }`}>
          {copied ? "Copiado!" : "Copiar"}
        </button>
      </div>
      <p className={`mt-1.5 break-all text-sm text-ink-800 ${mono ? "font-mono text-xs leading-relaxed" : ""}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

/** Seletor de período usado nas telas de resultado e nos relatórios. */
export function PeriodPicker({ value, onChange }: {
  value: Period; onChange: (period: Period) => void;
}) {
  const [from, setFrom] = useState(() => value.from.toISOString().slice(0, 10));
  const [to, setTo] = useState(() => value.to.toISOString().slice(0, 10));

  const pick = (key: PeriodKey) => onChange(resolvePeriod(key, from, to));

  return (
    <div className="card card-pad space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {PERIOD_OPTIONS.map((option) => (
          <button key={option.key} type="button" onClick={() => pick(option.key)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              value.key === option.key
                ? "bg-leaf-600 text-white"
                : "border border-[var(--border)] bg-white text-ink-600"
            }`}>
            {option.label}
          </button>
        ))}
      </div>

      {value.key === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-ink-500">
            De
            <input type="date" className="input mt-1 !min-h-[2.5rem] text-sm" value={from}
              onChange={(e) => { setFrom(e.target.value); onChange(resolvePeriod("custom", e.target.value, to)); }} />
          </label>
          <label className="text-xs font-semibold text-ink-500">
            Até
            <input type="date" className="input mt-1 !min-h-[2.5rem] text-sm" value={to}
              onChange={(e) => { setTo(e.target.value); onChange(resolvePeriod("custom", from, e.target.value)); }} />
          </label>
        </div>
      )}

      <p className="text-xs text-ink-500">{value.label}</p>
    </div>
  );
}

/**
 * Escolha do documento que autoriza o lançamento.
 * O arquivo fica em memória até a gravação — se a operação falhar, nada sobra.
 */
export function DocumentPicker({ file, onPick, label = "Documento de autorização", hint, accept = DOCUMENT_ACCEPT }: {
  file: File | null;
  onPick: (file: File | null) => void;
  label?: string;
  hint?: string;
  accept?: string;
}) {
  const [error, setError] = useState<string | null>(null);

  async function choose() {
    setError(null);
    try {
      const picked = await pickFile(accept);
      onPick(picked.file);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message !== "Nenhum arquivo escolhido.") setError(message);
    }
  }

  return (
    <div className="field">
      <span className="label">{label}</span>
      {file ? (
        <div className="flex items-center gap-2 rounded-xl border border-leaf-300 bg-leaf-50 px-3 py-2.5">
          <span aria-hidden>📎</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">{file.name}</span>
          <span className="shrink-0 text-xs text-ink-500">{humanSize(file.size)}</span>
          <button type="button" onClick={() => onPick(null)}
            className="shrink-0 text-sm font-semibold text-red-600">Tirar</button>
        </div>
      ) : (
        <button type="button" onClick={() => void choose()}
          className="w-full rounded-xl border border-dashed border-[var(--border)] bg-white px-3 py-3 text-sm font-semibold text-ink-600 active:bg-ink-50">
          📎 Anexar foto ou PDF
        </button>
      )}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}
    </div>
  );
}

/** Painel que sobe pela parte de baixo — cadastro rápido sem sair da tela. */
export function Sheet({ open, title, onClose, children }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose} role="presentation">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 pb-8 outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink-900">{title}</h2>
          <button type="button" onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-500">Fechar</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Abas simples, usadas no lançamento financeiro e nos ajustes de estoque. */
export function Tabs<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string; icon?: string }[];
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button key={option.id} type="button" onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          className={`rounded-xl px-2 py-3 text-sm font-bold leading-tight transition ${
            value === option.id
              ? "bg-leaf-600 text-white"
              : "border border-[var(--border)] bg-white text-ink-600"
          }`}>
          {option.icon && <span className="mr-1" aria-hidden>{option.icon}</span>}
          {option.label}
        </button>
      ))}
    </div>
  );
}
