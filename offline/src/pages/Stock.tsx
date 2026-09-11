import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { D, ZERO, money } from "@/lib/money";
import { brl, num } from "@/lib/format";
import { PRODUCT_KIND_LABELS } from "@/lib/defaults";
import { isBelowMin } from "@/logic/inventory";
import { Badge, Card, EmptyState, PageHeader, Spinner, StatCard } from "@/components/ui";

export default function StockPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const filtro = params.get("filtro") ?? "";
  const [kind, setKind] = useState("");

  const rows = useLiveQuery(async () => {
    const all = (await db.products.toArray()).filter((p) => !p.deletedAt);
    const needle = query.trim().toLowerCase();
    return all
      .filter((p) => !kind || p.kind === kind)
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle))
      .filter((p) => filtro !== "critico" || isBelowMin(p))
      .filter((p) => filtro !== "zerado" || D(p.quantity).lessThanOrEqualTo(0))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [query, kind, filtro]);

  const totalValue = rows
    ? money(rows.reduce((a, p) => a.plus(D(p.quantity).times(D(p.avgCost))), ZERO))
    : ZERO;
  const criticalCount = rows?.filter(isBelowMin).length ?? 0;

  const setFilter = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set("filtro", value); else next.delete("filtro");
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader title="Estoque" subtitle={rows ? `${rows.length} item(ns)` : undefined} />

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Valor em estoque" value={brl(totalValue)} hint="pelo custo médio" />
        <StatCard label="Itens críticos" value={criticalCount} hint="abaixo do mínimo"
          tone={criticalCount > 0 ? "red" : "green"} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Link to="/estoque/entrada" className="btn-primary btn-sm">⬇️ Entrada</Link>
        <Link to="/estoque/saida" className="btn-ghost btn-sm">⬆️ Saída</Link>
        <Link to="/estoque/ajuste" className="btn-ghost btn-sm">⚖️ Ajuste</Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <Link to="/estoque/lotes" className="font-semibold text-leaf-700">Lotes e validades →</Link>
        <Link to="/estoque/movimentos" className="font-semibold text-leaf-700">Movimentações →</Link>
      </div>

      <div className="mt-3 space-y-2">
        <input type="search" className="input" value={query} aria-label="Buscar item"
          onChange={(e) => setQuery(e.target.value)} placeholder="Buscar item no estoque" />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[{ value: "", label: "Todos" },
            ...Object.entries(PRODUCT_KIND_LABELS).map(([value, label]) => ({ value, label }))]
            .map((o) => (
              <button key={o.value} type="button" onClick={() => setKind(o.value)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ${
                  kind === o.value ? "bg-leaf-600 text-white" : "border border-[var(--border)] bg-white text-ink-600"
                }`}>{o.label}</button>
            ))}
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[{ value: "", label: "Situação: todas" },
            { value: "critico", label: "Abaixo do mínimo" },
            { value: "zerado", label: "Zerados" }].map((o) => (
              <button key={o.value} type="button" onClick={() => setFilter(o.value)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ${
                  filtro === o.value ? "bg-leaf-600 text-white" : "border border-[var(--border)] bg-white text-ink-600"
                }`}>{o.label}</button>
            ))}
        </div>
      </div>

      <div className="mt-3">
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon="📦" title="Nenhum item encontrado" detail="Ajuste os filtros ou registre uma entrada." />
        ) : (
          <Card pad={false}>
            {rows.map((product) => {
              const low = isBelowMin(product);
              return (
                <Link key={product.id} to={`/produtos/${product.id}`} className="block active:bg-ink-50">
                  <div className="row">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-ink-900">{product.name}</span>
                        {low && <Badge tone="red">baixo</Badge>}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-500">
                        Mín. {num(D(product.minStock), 1)} · {brl(money(D(product.quantity).times(D(product.avgCost))))}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`text-base font-bold tabular-nums ${low ? "text-red-600" : "text-ink-900"}`}>
                        {num(D(product.quantity), 1)}
                      </div>
                      <div className="text-xs text-ink-500">{product.unit.toLowerCase()}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
