import { getCurrentUser } from "@/lib/auth";
import { cashFlow } from "@/server/services/finance";
import { resolvePeriod } from "@/server/services/reports";
import { brl } from "@/lib/format";
import { Card, PageHeader, StatCard } from "@/components/ui";
import { PeriodFilter } from "@/components/period-filter";
import { D } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function CashFlowPage({
  searchParams,
}: { searchParams: Promise<{ periodo?: string; de?: string; ate?: string }> }) {
  const user = (await getCurrentUser())!;
  const { periodo, de, ate } = await searchParams;
  const period = resolvePeriod(periodo ?? "mes", de, ate);
  const flow = await cashFlow(user.companyId, period.from, period.to);

  const max = flow.series.reduce(
    (acc, row) => Math.max(acc, D(row.inflow).toNumber(), D(row.outflow).toNumber()), 1,
  );

  return (
    <div>
      <PageHeader title="Fluxo de caixa" subtitle={period.label} />
      <PeriodFilter />

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <StatCard label="Entradas" value={brl(flow.totals.inflow)} tone="green" />
        <StatCard label="Saídas" value={brl(flow.totals.outflow)} tone="red" />
        <StatCard label="Saldo do período" value={brl(flow.totals.net)}
          tone={flow.totals.net.greaterThanOrEqualTo(0) ? "green" : "red"} />
        <StatCard label="Previsto a receber" value={brl(flow.totals.plannedIn)}
          hint={`a pagar ${brl(flow.totals.plannedOut)}`} />
      </div>

      <div className="mt-4">
        {flow.series.length === 0 ? (
          <Card><p className="text-sm text-ink-500">Nenhuma movimentação financeira no período.</p></Card>
        ) : (
          <Card pad={false}>
            <div className="border-b border-[var(--border)] px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Dia a dia</p>
            </div>
            {flow.series.map((row) => {
              const inflow = D(row.inflow).toNumber();
              const outflow = D(row.outflow).toNumber();
              return (
                <div key={row.date} className="border-b border-[var(--border)] px-4 py-3 last:border-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-ink-800">
                      {new Date(`${row.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                    </span>
                    <span className={`font-bold tabular-nums ${D(row.net).greaterThanOrEqualTo(0) ? "text-leaf-700" : "text-red-600"}`}>
                      {brl(row.net)}
                    </span>
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {inflow > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 rounded-full bg-leaf-500" style={{ width: `${Math.max(4, (inflow / max) * 100)}%` }} />
                        <span className="text-xs tabular-nums text-leaf-700">{brl(row.inflow)}</span>
                      </div>
                    )}
                    {outflow > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 rounded-full bg-red-400" style={{ width: `${Math.max(4, (outflow / max) * 100)}%` }} />
                        <span className="text-xs tabular-nums text-red-600">{brl(row.outflow)}</span>
                      </div>
                    )}
                  </div>
                  {(D(row.plannedIn).greaterThan(0) || D(row.plannedOut).greaterThan(0)) && (
                    <p className="mt-1 text-xs text-ink-400">
                      Previsto: +{brl(row.plannedIn)} / −{brl(row.plannedOut)}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-ink-500">Acumulado {brl(row.accumulated)}</p>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
