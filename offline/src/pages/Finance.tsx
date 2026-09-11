import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { D } from "@/lib/money";
import { brl, date, relativeDays } from "@/lib/format";
import { cashFlow, financeSummary } from "@/logic/finance";
import { monthRange } from "@/logic/dashboard";
import { Card, PageHeader, QuickAction, SectionTitle, Spinner, StatCard } from "@/components/ui";

export default function FinancePage() {
  const data = useLiveQuery(async () => {
    await db.finance.count();
    const now = new Date();
    const month = monthRange(now);
    const [summary, flow, entries, customers] = await Promise.all([
      financeSummary(now),
      cashFlow(month.start, month.end),
      db.finance.toArray(),
      db.customers.toArray(),
    ]);
    const byId = new Map(customers.map((c) => [c.id, c]));
    const limit = new Date(now.getTime() + 7 * 86400000).toISOString();
    const upcoming = entries
      .filter((e) => !e.deletedAt && (e.status === "OPEN" || e.status === "PARTIAL") && e.dueDate <= limit)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 12)
      .map((e) => ({ ...e, customer: e.customerId ? byId.get(e.customerId) : undefined }));
    return { summary, flow, upcoming, now: now.toISOString() };
  }, []);

  if (!data) return <Spinner />;
  const { summary, flow, upcoming } = data;

  return (
    <div>
      <PageHeader title="Financeiro" subtitle="Contas, fluxo de caixa e resultado" />

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="A receber" value={brl(summary.toReceive)} to="/financeiro/receber"
          hint={summary.overdueReceivableCount > 0
            ? `${summary.overdueReceivableCount} vencido(s)`
            : `${summary.toReceiveCount} título(s)`}
          tone={summary.overdueReceivableCount > 0 ? "red" : "neutral"} />
        <StatCard label="A pagar" value={brl(summary.toPay)} to="/financeiro/pagar"
          hint={summary.overduePayableCount > 0
            ? `${summary.overduePayableCount} vencida(s)`
            : `${summary.toPayCount} título(s)`}
          tone={summary.overduePayableCount > 0 ? "red" : "neutral"} />
        <StatCard label="Recebido no mês" value={brl(summary.receivedMonth)} tone="green" />
        <StatCard label="Pago no mês" value={brl(summary.paidMonth)} />
        <StatCard label="Resultado realizado" value={brl(summary.realizedResult)}
          hint="recebido − pago"
          tone={summary.realizedResult.greaterThanOrEqualTo(0) ? "green" : "red"} />
        <StatCard label="Resultado previsto" value={brl(summary.projectedResult)}
          hint="a receber − a pagar"
          tone={summary.projectedResult.greaterThanOrEqualTo(0) ? "green" : "red"} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <QuickAction to="/financeiro/receber" icon="💵" label="Receber" tone="leaf" />
        <QuickAction to="/financeiro/pagar" icon="💳" label="Pagar" tone="white" />
        <QuickAction to="/financeiro/novo" icon="➕" label="Lançar" tone="banana" />
      </div>

      <SectionTitle>Vencendo nos próximos 7 dias</SectionTitle>
      {upcoming.length === 0 ? (
        <Card><p className="text-sm text-ink-500">Nenhum título vencendo nos próximos 7 dias.</p></Card>
      ) : (
        <Card pad={false}>
          {upcoming.map((entry) => {
            const late = entry.dueDate < data.now;
            const isIn = entry.direction === "RECEIVABLE";
            return (
              <Link key={entry.id} to={isIn ? "/financeiro/receber" : "/financeiro/pagar"}
                className="block active:bg-ink-50">
                <div className="row">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-800">{entry.description}</p>
                    <p className={`text-xs ${late ? "font-semibold text-red-600" : "text-ink-500"}`}>
                      {entry.customer?.name ?? entry.supplierName ?? entry.category ?? "—"} ·{" "}
                      {date(entry.dueDate)} ({relativeDays(entry.dueDate)})
                    </p>
                  </div>
                  <span className={`shrink-0 font-bold tabular-nums ${isIn ? "text-leaf-700" : "text-red-600"}`}>
                    {isIn ? "+" : "−"}{brl(D(entry.amount).minus(D(entry.paidAmount)))}
                  </span>
                </div>
              </Link>
            );
          })}
        </Card>
      )}

      <SectionTitle>Resumo do mês</SectionTitle>
      <Card pad={false}>
        <div className="row"><span className="text-ink-500">Entradas realizadas</span>
          <span className="font-semibold tabular-nums text-leaf-700">{brl(flow.totals.inflow)}</span></div>
        <div className="row"><span className="text-ink-500">Saídas realizadas</span>
          <span className="font-semibold tabular-nums text-red-600">{brl(flow.totals.outflow)}</span></div>
        <div className="row"><span className="text-ink-500">Entradas previstas</span>
          <span className="font-semibold tabular-nums">{brl(flow.totals.plannedIn)}</span></div>
        <div className="row"><span className="text-ink-500">Saídas previstas</span>
          <span className="font-semibold tabular-nums">{brl(flow.totals.plannedOut)}</span></div>
        <div className="row bg-ink-50"><span className="font-bold">Saldo do período</span>
          <span className={`font-bold tabular-nums ${
            flow.totals.net.greaterThanOrEqualTo(0) ? "text-leaf-700" : "text-red-600"
          }`}>{brl(flow.totals.net)}</span></div>
      </Card>
    </div>
  );
}
