"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** Busca com debounce sincronizada com a URL. */
export function SearchInput({ placeholder = "Buscar...", paramName = "q" }: { placeholder?: string; paramName?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get(paramName) ?? "");

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(paramName, value);
      else next.delete(paramName);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden>🔍</span>
      <input
        type="search"
        className="input pl-10"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}

/** Grupo de filtros em "pílulas", também sincronizado com a URL. */
export function FilterPills({
  paramName, options, allLabel = "Todos",
}: { paramName: string; options: { value: string; label: string }[]; allLabel?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get(paramName) ?? "";

  const go = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(paramName, value);
    else next.delete(paramName);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const items = allLabel ? [{ value: "", label: allLabel }, ...options] : options;

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {items.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => go(option.value)}
          className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
            current === option.value
              ? "bg-leaf-600 text-white"
              : "border border-[var(--border)] bg-white text-ink-600"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
