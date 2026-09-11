import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { D, ZERO, money } from "@/lib/money";
import { brl, date, num } from "@/lib/format";
import { PRODUCTION_STATUS_LABELS } from "@/lib/defaults";
import { dayRange, monthRange } from "@/logic/dashboard";
import { Badge, Card, EmptyState, PageHeader, Spinner, StatCard, type Tone } from "@/components/ui";

const TONE: Record<string, Tone> = {
  PLANNED: "blue", IN_PROGRESS: "yellow", FINISHED: "green", CANCELLED: "neutral",
};

export default function ProductionPage() {
  const [status, setStatus] = useState("");

  const data = useLiveQuery(async () => {
    const [productions, products] = await Promise.all([db.productions.toArray(), db.products.toArray()]);
    const byId = new Map(products.map((p) => [p.id, p]));
    const today = dayRange(), month = monthRange();

    const finished = productions.filter((p) => p.status === "FINISHED" && p.finishedAt);
    const todayQty = finished
      .filter((p) => p.finishedAt! >= today.start.toISOString() && p.finishedAt! <= today.end.toISOString())
      .reduce((a, p) => a.plus(D(p.producedQty)), ZERO);
    const monthOnes = finished
      .filter((p) => p.finishedAt! >= month.start.toISOString() && p.finishedAt! <= month.end.toISOString());

    const rows = productions
      .filter((p) => !status || p.status === status)
      .map((p) => ({ ...p, product: byId.get(p.productId) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      rows, todayQty,
      monthQty: monthOnes.reduce((a, p) => a.plus(D(p.producedQty)), ZERO),
      monthCount: monthOnes.length,
      monthLoss: monthOnes.reduce((a, p) => a.plus(D(p.lossQty)), ZERO),
    };
  }, [status]);

  return (
    <div>
      <PageHeader title="Produção" subtitle="Ordens, lotes e rendimento"
        action={<Link to="/producao/nova" className="btn-banana btn-sm">+ Produzir</Link>} />

      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="Hoje" value={num(data?.todayQty ?? 0, 1)} hint="kg produzidos" />
        <StatCard label="No mês" value={num(data?.monthQty ?? 0, 1)}
          hint={`${data?.monthCount ?? 0} produção(ões)`} />
        <StatCard label="Perdas no mês" value={num(data?.monthLoss ?? 0, 1)} hint="kg"
          tone={D(data?.monthLoss ?? 0).greaterThan(0) ? "red" : "neutral"} />
      </div>

      <div className="mt-3 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[{ value: "", label: "Todas" },
          ...Object.entries(PRODUCTION_STATUS_LABELS).map(([value, label]) => ({ value, label }))].map((o) => (
            <button key={o.value} type="button" onClick={() => setStatus(o.value)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ${
                status === o.value ? "bg-leaf-600 text-white" : "border border-[var(--border)] bg-white text-ink-600"
              }`}>{o.label}</button>
          ))}
      </div>

      <div className="mt-3">
        {!data ? <Spinner /> : data.rows.length === 0 ? (
          <EmptyState icon="🏭" title="Nenhuma ordem de produção"
            detail="Registre uma produção para gerar lote, baixar matéria-prima e apurar o custo real."
            action={<Link to="/producao/nova" className="btn-primary btn-sm">Registrar produção</Link>} />
        ) : (
          <Card pad={false}>
            {data.rows.map((order) => (
              <Link key={order.id} to={`/producao/${order.id}`} className="block active:bg-ink-50">
                <div className="row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-ink-900">{order.product?.name}</span>
                      <Badge tone={TONE[order.status]}>{PRODUCTION_STATUS_LABELS[order.status]}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {order.code} · {date(order.finishedAt ?? order.createdAt)}
                      {order.batchCode && ` · lote ${order.batchCode}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums text-ink-900">
                      {num(D(order.producedQty ?? order.plannedQty), 1)} {order.product?.unit.toLowerCase()}
                    </p>
                    <p className="text-xs text-ink-500">
                      {order.status === "FINISHED"
                        ? `${brl(money(D(order.unitCost)))}/${order.product?.unit.toLowerCase()}` +
                          (order.actualYieldPct ? ` · ${num(D(order.actualYieldPct), 0)}%` : "")
                        : "planejado"}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
