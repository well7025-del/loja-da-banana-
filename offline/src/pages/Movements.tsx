import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { D } from "@/lib/money";
import { brl, datetime, num } from "@/lib/format";
import { MOVEMENT_REASON_LABELS } from "@/lib/defaults";
import { Card, EmptyState, PageHeader, Spinner } from "@/components/ui";

const FILTERS = ["PURCHASE", "PRODUCTION_IN", "PRODUCTION_OUT", "SALE", "LOSS", "ADJUSTMENT"];

export default function MovementsPage() {
  const [reason, setReason] = useState("");

  const rows = useLiveQuery(async () => {
    const [movements, products, batches] = await Promise.all([
      db.movements.orderBy("createdAt").reverse().limit(200).toArray(),
      db.products.toArray(),
      db.batches.toArray(),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));
    const batchById = new Map(batches.map((b) => [b.id, b]));
    return movements
      .filter((m) => !reason || m.reason === reason)
      .map((m) => ({
        ...m,
        product: productById.get(m.productId),
        batch: m.batchId ? batchById.get(m.batchId) : undefined,
      }));
  }, [reason]);

  return (
    <div>
      <PageHeader title="Movimentações" subtitle="Últimos 200 lançamentos de estoque" />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[{ value: "", label: "Todas" },
          ...FILTERS.map((value) => ({ value, label: MOVEMENT_REASON_LABELS[value] }))].map((o) => (
            <button key={o.value} type="button" onClick={() => setReason(o.value)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ${
                reason === o.value ? "bg-leaf-600 text-white" : "border border-[var(--border)] bg-white text-ink-600"
              }`}>{o.label}</button>
          ))}
      </div>

      <div className="mt-3">
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon="📄" title="Nenhuma movimentação" />
        ) : (
          <Card pad={false}>
            {rows.map((m) => (
              <div key={m.id} className="row">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">{m.product?.name ?? "—"}</p>
                  <p className="truncate text-xs text-ink-500">
                    {MOVEMENT_REASON_LABELS[m.reason]} · {datetime(m.createdAt)}
                    {m.batch && ` · ${m.batch.code}`}
                  </p>
                  {m.note && <p className="truncate text-xs text-ink-400">{m.note}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className={`font-bold tabular-nums ${
                    m.type === "IN" ? "text-leaf-700" : m.type === "OUT" ? "text-red-600" : "text-ink-700"
                  }`}>
                    {m.type === "IN" ? "+" : m.type === "OUT" ? "−" : "±"}
                    {num(D(m.quantity), 2)} {m.product?.unit.toLowerCase()}
                  </p>
                  <p className="text-xs text-ink-500">
                    saldo {num(D(m.balanceAfter), 1)} · {brl(m.totalCost)}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
