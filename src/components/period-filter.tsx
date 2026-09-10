"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const PRESETS = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
  { value: "ano", label: "Ano" },
  { value: "personalizado", label: "Período" },
];

export function PeriodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("periodo") ?? "mes";
  const [custom, setCustom] = useState(current === "personalizado");

  const go = (next: URLSearchParams) => router.replace(`${pathname}?${next.toString()}`, { scroll: false });

  const select = (value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("periodo", value);
    setCustom(value === "personalizado");
    if (value !== "personalizado") { next.delete("de"); next.delete("ate"); go(next); }
    else go(next);
  };

  const setRange = (key: "de" | "ate", value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("periodo", "personalizado");
    next.set(key, value);
    go(next);
  };

  return (
    <div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => select(preset.value)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
              current === preset.value ? "bg-leaf-600 text-white" : "border border-[var(--border)] bg-white text-ink-600"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {custom && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-ink-500">
            De
            <input type="date" className="input mt-1 !min-h-[2.75rem]" defaultValue={params.get("de") ?? ""}
              onChange={(e) => setRange("de", e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-ink-500">
            Até
            <input type="date" className="input mt-1 !min-h-[2.75rem]" defaultValue={params.get("ate") ?? ""}
              onChange={(e) => setRange("ate", e.target.value)} />
          </label>
        </div>
      )}
    </div>
  );
}
