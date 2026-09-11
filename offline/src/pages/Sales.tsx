import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { D, ZERO, money } from "@/lib/money";
import { brl, datetime, num } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/defaults";
import { dayRange, monthRange } from "@/logic/dashboard";
import { Badge, Card, EmptyState, PageHeader, Spinner, StatCard } from "@/components/ui";

export default function SalesPage() {
  const [query, setQuery] = useState("");

  const data = useLiveQuery(async () => {
    const [sales, customers] = await Promise.all([db.sales.toArray(), db.customers.toArray()]);
    const byId = new Map(customers.map((c) => [c.id, c]));
    const today = dayRange(), month = monthRange();
    const done = sales.filter((s) => s.status === "COMPLETED");

    const inRange = (list: typeof done, from: Date, to: Date) =>
      list.filter((s) => s.soldAt >= from.toISOString() && s.soldAt <= to.toISOString());
    const sum = (list: typeof done, field: "total" | "grossProfit") =>
      money(list.reduce((a, s) => a.plus(D(s[field])), ZERO));

    const todayOnes = inRange(done, today.start, today.end);
    const monthOnes = inRange(done, month.start, month.end);
    const needle = query.trim().toLowerCase();

    return {
      rows: sales
        .map((s) => ({ ...s, customer: s.customerId ? byId.get(s.customerId) : undefined }))
        .filter((s) => !needle ||
          s.number.toLowerCase().includes(needle) ||
          (s.customer?.name ?? "").toLowerCase().includes(needle))
        .sort((a, b) => b.soldAt.localeCompare(a.soldAt))
        .slice(0, 100),
      todayTotal: sum(todayOnes, "total"), todayProfit: sum(todayOnes, "grossProfit"),
      todayCount: todayOnes.length,
      monthTotal: sum(monthOnes, "total"), monthProfit: sum(monthOnes, "grossProfit"),
      monthCount: monthOnes.length,
    };
  }, [query]);

  return (
    <div>
      <PageHeader title="Vendas"
        action={<Link to="/vendas/nova" className="btn-banana btn-sm">+ Vender</Link>} />

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Hoje" value={brl(data?.todayTotal ?? 0)}
          hint={`${data?.todayCount ?? 0} venda(s) · lucro ${brl(data?.todayProfit ?? 0)}`} />
        <StatCard label="No mês" value={brl(data?.monthTotal ?? 0)} tone="green"
          hint={`${data?.monthCount ?? 0} venda(s) · lucro ${brl(data?.monthProfit ?? 0)}`} />
      </div>

      <div className="mt-3">
        <input type="search" className="input" value={query} aria-label="Buscar venda"
          onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por número ou cliente" />
      </div>

      <div className="mt-3">
        {!data ? <Spinner /> : data.rows.length === 0 ? (
          <EmptyState icon="🛒" title="Nenhuma venda registrada"
            action={<Link to="/vendas/nova" className="btn-primary btn-sm">Registrar venda</Link>} />
        ) : (
          <Card pad={false}>
            {data.rows.map((sale) => (
              <Link key={sale.id} to={`/vendas/${sale.id}`} className="block active:bg-ink-50">
                <div className="row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-ink-900">
                        {sale.customer?.name ?? "Consumidor no balcão"}
                      </span>
                      {sale.status === "CANCELLED" && <Badge tone="red">cancelada</Badge>}
                    </div>
                    <p className="truncate text-xs text-ink-500">
                      {sale.number} · {datetime(sale.soldAt)} ·{" "}
                      {PAYMENT_METHOD_LABELS[sale.paymentMethod]} · {sale.items.length} item(ns)
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`font-bold tabular-nums ${
                      sale.status === "CANCELLED" ? "text-ink-400 line-through" : "text-ink-900"
                    }`}>{brl(sale.total)}</p>
                    <p className="text-xs text-ink-500">margem {num(D(sale.marginPct), 1)}%</p>
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
