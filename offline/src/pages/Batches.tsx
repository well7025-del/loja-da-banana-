import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { D } from "@/lib/money";
import { date, num, relativeDays } from "@/lib/format";
import { getSettings } from "@/logic/settings";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";

export default function BatchesPage() {
  const [filtro, setFiltro] = useState("");
  const [query, setQuery] = useState("");

  const data = useLiveQuery(async () => {
    const [batches, products, settings] = await Promise.all([
      db.batches.toArray(), db.products.toArray(), getSettings(),
    ]);
    const byId = new Map(products.map((p) => [p.id, p]));
    const alertDays = Number(settings.expiryAlertDays || 30);
    const limit = new Date(Date.now() + alertDays * 86400000).toISOString();
    const today = new Date().toISOString();
    const needle = query.trim().toLowerCase();

    const rows = batches
      .map((b) => ({ ...b, product: byId.get(b.productId) }))
      .filter((b) => !needle ||
        b.code.toLowerCase().includes(needle) ||
        (b.product?.name ?? "").toLowerCase().includes(needle))
      .filter((b) => {
        if (filtro === "disponiveis") return D(b.availableQty).greaterThan(0);
        if (filtro === "vencendo") {
          return D(b.availableQty).greaterThan(0) && b.expiresAt && b.expiresAt <= limit && b.expiresAt >= today;
        }
        if (filtro === "vencidos") return b.expiresAt && b.expiresAt < today;
        return true;
      })
      .sort((a, b) => b.manufacturedAt.localeCompare(a.manufacturedAt));

    return { rows, alertDays, today, limit };
  }, [filtro, query]);

  return (
    <div>
      <PageHeader title="Lotes" subtitle="Rastreabilidade e controle de validade" />

      <div className="space-y-2">
        <input type="search" className="input" value={query} aria-label="Buscar lote"
          onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por lote ou produto" />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[{ value: "", label: "Todos" },
            { value: "disponiveis", label: "Com saldo" },
            { value: "vencendo", label: `Vencem em ${data?.alertDays ?? 30}d` },
            { value: "vencidos", label: "Vencidos" }].map((o) => (
              <button key={o.value} type="button" onClick={() => setFiltro(o.value)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ${
                  filtro === o.value ? "bg-leaf-600 text-white" : "border border-[var(--border)] bg-white text-ink-600"
                }`}>{o.label}</button>
            ))}
        </div>
      </div>

      <div className="mt-3">
        {!data ? <Spinner /> : data.rows.length === 0 ? (
          <EmptyState icon="🏷️" title="Nenhum lote encontrado"
            detail="Os lotes são criados automaticamente na produção e na entrada de mercadoria." />
        ) : (
          <Card pad={false}>
            {data.rows.map((batch) => {
              const expired = batch.expiresAt && batch.expiresAt < data.today;
              const soon = !expired && batch.expiresAt && batch.expiresAt <= data.limit;
              return (
                <div key={batch.id} className="row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-ink-900">
                        {batch.product?.name ?? "(produto removido)"}
                      </span>
                      {expired && <Badge tone="red">vencido</Badge>}
                      {soon && <Badge tone="yellow">vence {relativeDays(batch.expiresAt)}</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-500">
                      {batch.code} · fabricado em {date(batch.manufacturedAt)}
                      {batch.expiresAt && ` · vence ${date(batch.expiresAt)}`}
                      {batch.supplierName && ` · ${batch.supplierName}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold tabular-nums text-ink-900">
                      {num(D(batch.availableQty), 1)} {batch.product?.unit.toLowerCase()}
                    </div>
                    <div className="text-xs text-ink-500">de {num(D(batch.producedQty), 1)}</div>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
