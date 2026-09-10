import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { financeSummary, delinquentCustomers, cashFlow } from "@/server/services/finance";
import { brl, date, relativeDays } from "@/lib/format";
import { prisma } from "@/lib/db";
import { D } from "@/lib/money";
import { Card, PageHeader, QuickAction, SectionTitle, StatCard } from "@/components/ui";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const user = (await getCurrentUser())!;
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400000);

  const [summary, delinquent, flow, upcoming] = await Promise.all([
    financeSummary(user.companyId),
    delinquentCustomers(user.companyId),
    cashFlow(user.companyId, new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    prisma.financeEntry.findMany({
      where: {
        companyId: user.companyId, deletedAt: null,
        status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lte: in7 },
      },
      include: { customer: true, supplier: true },
      orderBy: { dueDate: "asc" },
      take: 12,
    }),
  ]);

  return (
    <div>
      <PageHeader title="Financeiro" subtitle="Contas, fluxo de caixa e resultado" />

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard
          label="A receber" value={brl(summary.toReceive)} href="/financeiro/receber"
          hint={summary.overdueReceivableCount > 0 ? `${summary.overdueReceivableCount} vencido(s)` : `${summary.toReceiveCount} título(s)`}
          tone={summary.overdueReceivableCount > 0 ? "red" : "neutral"}
        />
        <StatCard
          label="A pagar" value={brl(summary.toPay)} href="/financeiro/pagar"
          hint={summary.overduePayableCount > 0 ? `${summary.overduePayableCount} vencida(s)` : `${summary.toPayCount} título(s)`}
          tone={summary.overduePayableCount > 0 ? "red" : "neutral"}
        />
        <StatCard label="Recebido no mês" value={brl(summary.receivedMonth)} tone="green" />
        <StatCard label="Pago no mês" value={brl(summary.paidMonth)} />
        <StatCard label="Resultado realizado" value={brl(summary.realizedResult)}
          tone={summary.realizedResult.greaterThanOrEqualTo(0) ? "green" : "red"} hint="recebido − pago" />
        <StatCard label="Resultado previsto" value={brl(summary.projectedResult)}
          tone={summary.projectedResult.greaterThanOrEqualTo(0) ? "green" : "red"} hint="a receber − a pagar" />
      </div>

      {can(user.permissions, "finance.create") && (
        <div className="mt-3 grid grid-cols-4 gap-2.5">
          <QuickAction href="/financeiro/receber" icon="💵" label="Receber" tone="leaf" />
          <QuickAction href="/financeiro/pagar" icon="💳" label="Pagar" tone="white" />
          <QuickAction href="/financeiro/novo" icon="➕" label="Lançar" tone="banana" />
          <QuickAction href="/financeiro/despesas" icon="🧾" label="Despesas" tone="white" />
        </div>
      )}

      <div className="mt-3 text-sm">
        <Link href="/financeiro/fluxo-caixa" className="font-semibold text-leaf-700">Ver fluxo de caixa completo →</Link>
      </div>

      <SectionTitle>Vencendo nos próximos 7 dias</SectionTitle>
      {upcoming.length === 0 ? (
        <Card><p className="text-sm text-ink-500">Nenhum título vencendo nos próximos 7 dias.</p></Card>
      ) : (
        <Card pad={false}>
          {upcoming.map((entry) => {
            const late = entry.dueDate < now;
            const isIn = entry.direction === "RECEIVABLE";
            return (
              <Link key={entry.id} href={isIn ? "/financeiro/receber" : "/financeiro/pagar"} className="block active:bg-ink-50">
                <div className="row">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-800">{entry.description}</p>
                    <p className={`text-xs ${late ? "font-semibold text-red-600" : "text-ink-500"}`}>
                      {entry.customer?.name ?? entry.supplier?.name ?? "—"} · {date(entry.dueDate)} ({relativeDays(entry.dueDate)})
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

      {delinquent.length > 0 && (
        <>
          <SectionTitle>Clientes inadimplentes</SectionTitle>
          <Card pad={false}>
            {delinquent.slice(0, 8).map((row) => (
              <Link key={row.customer.id} href={`/clientes/${row.customer.id}`} className="block active:bg-ink-50">
                <div className="row">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">{row.customer.name}</p>
                    <p className="text-xs text-red-600">
                      {row.count} título(s) · mais antigo venceu {relativeDays(row.oldestDue)}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold tabular-nums text-red-600">{brl(row.total)}</span>
                </div>
              </Link>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Resumo do mês</SectionTitle>
      <Card pad={false}>
        <div className="row"><span className="text-ink-500">Entradas realizadas</span><span className="font-semibold tabular-nums text-leaf-700">{brl(flow.totals.inflow)}</span></div>
        <div className="row"><span className="text-ink-500">Saídas realizadas</span><span className="font-semibold tabular-nums text-red-600">{brl(flow.totals.outflow)}</span></div>
        <div className="row"><span className="text-ink-500">Entradas previstas</span><span className="font-semibold tabular-nums">{brl(flow.totals.plannedIn)}</span></div>
        <div className="row"><span className="text-ink-500">Saídas previstas</span><span className="font-semibold tabular-nums">{brl(flow.totals.plannedOut)}</span></div>
        <div className="row bg-ink-50"><span className="font-bold">Saldo do período</span>
          <span className={`font-bold tabular-nums ${flow.totals.net.greaterThanOrEqualTo(0) ? "text-leaf-700" : "text-red-600"}`}>
            {brl(flow.totals.net)}
          </span>
        </div>
      </Card>
    </div>
  );
}
