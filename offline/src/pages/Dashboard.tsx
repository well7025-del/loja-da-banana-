import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { buildAlerts, getDashboard } from "@/logic/dashboard";
import { brl, date, num } from "@/lib/format";
import { D } from "@/lib/money";
import { Card, EmptyState, QuickAction, SectionTitle, Spinner, StatCard } from "@/components/ui";

const ALERT_STYLES = {
  danger: "border-l-4 border-red-500 bg-red-50",
  warning: "border-l-4 border-banana-500 bg-banana-50",
  info: "border-l-4 border-sky-400 bg-sky-50",
} as const;

export default function DashboardPage() {
  // Recalcula sozinho sempre que qualquer tabela muda.
  const data = useLiveQuery(async () => {
    await Promise.all([db.sales.count(), db.products.count(), db.finance.count(), db.productions.count()]);
    return getDashboard();
  }, []);

  if (!data) return <Spinner />;
  const alerts = buildAlerts(data);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm text-ink-500">{greeting},</p>
        <h1 className="text-xl font-bold text-ink-900">Loja da Banana 🍌</h1>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        <QuickAction to="/vendas/nova" icon="🛒" label="Nova venda" />
        <QuickAction to="/producao/nova" icon="🏭" label="Registrar produção" tone="leaf" />
        <QuickAction to="/estoque/entrada" icon="⬇️" label="Entrada de estoque" tone="white" />
        <QuickAction to="/estoque/saida" icon="⬆️" label="Saída de estoque" tone="white" />
        <QuickAction to="/financeiro/receber" icon="💵" label="Receber" tone="white" />
        <QuickAction to="/financeiro/pagar" icon="💳" label="Pagar" tone="white" />
      </div>

      <SectionTitle>Resumo</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        <StatCard icon="🛒" label="Vendas hoje" value={brl(data.salesToday.total)}
          hint={`${data.salesToday.count} venda(s)`} to="/vendas" />
        <StatCard icon="📅" label="Vendas do mês" value={brl(data.salesMonth.total)}
          hint={`${data.salesMonth.count} venda(s)`} to="/vendas" />
        <StatCard icon="📈" label="Lucro do mês" value={brl(data.salesMonth.profit)}
          hint={`Margem de ${num(data.salesMonth.marginPct, 1)}%`} tone="green" />
        <StatCard icon="🧾" label="Contas a receber" value={brl(data.finance.toReceive)}
          hint={data.finance.overdueReceivableCount > 0
            ? `${data.finance.overdueReceivableCount} vencido(s)`
            : `${data.finance.toReceiveCount} título(s)`}
          tone={data.finance.overdueReceivableCount > 0 ? "red" : "neutral"}
          to="/financeiro/receber" />
        <StatCard icon="💳" label="Contas a pagar" value={brl(data.finance.toPay)}
          hint={data.finance.overduePayableCount > 0
            ? `${data.finance.overduePayableCount} vencida(s)`
            : `${data.finance.toPayCount} título(s)`}
          tone={data.finance.overduePayableCount > 0 ? "red" : "neutral"}
          to="/financeiro/pagar" />
        <StatCard icon="⚠️" label="Estoque crítico" value={data.criticalStock.length}
          hint="Itens abaixo do mínimo"
          tone={data.criticalStock.length > 0 ? "red" : "neutral"} to="/estoque?filtro=critico" />
        <StatCard icon="🏭" label="Produção hoje" value={`${num(data.productionToday.qty, 1)} kg`}
          hint={`${data.productionToday.count} produção(ões)`} to="/producao" />
        <StatCard icon="📦" label="Produto acabado" value={`${num(data.finishedQty, 1)} kg`}
          hint={`Estoque total ${brl(data.stockValue)}`} to="/estoque" />
      </div>

      <SectionTitle
        action={<Link to="/central-decisoes" className="text-sm font-semibold text-leaf-700">Central de Decisões →</Link>}
      >
        Alertas
      </SectionTitle>
      {alerts.length === 0 ? (
        <EmptyState icon="✅" title="Nenhum alerta no momento"
          detail="Estoque, financeiro e produção estão em dia." />
      ) : (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <Link key={i} to={alert.href} className={`block rounded-xl px-3.5 py-3 ${ALERT_STYLES[alert.level]}`}>
              <div className="flex gap-2.5">
                <span className="text-lg leading-none" aria-hidden>{alert.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink-900">{alert.title}</p>
                  <p className="mt-0.5 text-xs text-ink-600">{alert.detail}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {data.criticalStock.length > 0 && (
        <>
          <SectionTitle action={<Link to="/estoque" className="text-sm font-semibold text-leaf-700">Ver tudo</Link>}>
            Precisa de reposição
          </SectionTitle>
          <Card pad={false}>
            {data.criticalStock.slice(0, 6).map((item) => (
              <div key={item.id} className="row">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">{item.name}</p>
                  <p className="text-xs text-ink-500">Mínimo: {num(D(item.minStock), 1)} {item.unit.toLowerCase()}</p>
                </div>
                <p className="shrink-0 font-bold tabular-nums text-red-600">
                  {num(D(item.quantity), 1)} {item.unit.toLowerCase()}
                </p>
              </div>
            ))}
          </Card>
        </>
      )}

      {data.batchesExpiring.length > 0 && (
        <>
          <SectionTitle action={<Link to="/estoque/lotes" className="text-sm font-semibold text-leaf-700">Ver lotes</Link>}>
            Validade próxima
          </SectionTitle>
          <Card pad={false}>
            {data.batchesExpiring.slice(0, 5).map((batch) => (
              <div key={batch.id} className="row">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">{batch.product?.name}</p>
                  <p className="text-xs text-ink-500">Lote {batch.code}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-banana-700">{date(batch.expiresAt)}</p>
                  <p className="text-xs text-ink-500">
                    {num(D(batch.availableQty), 1)} {batch.product?.unit.toLowerCase()}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
