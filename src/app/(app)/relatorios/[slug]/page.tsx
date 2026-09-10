import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { D, ZERO } from "@/lib/money";
import { brl, date, num } from "@/lib/format";
import {
  financeReport, idleStock, lossesReport, productionReport, purchasesReport,
  resolvePeriod, salesByCustomer, salesByPeriod, salesByProduct, salesBySeller, stockReport,
} from "@/server/services/reports";
import { yieldReport } from "@/server/services/production";
import { cashFlow } from "@/server/services/finance";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { PeriodFilter } from "@/components/period-filter";
import { REPORTS } from "../_registry";
import { CUSTOMER_TYPE_LABELS, PAYMENT_METHOD_LABELS, PRODUCT_KIND_LABELS } from "@/lib/defaults";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ periodo?: string; de?: string; ate?: string }> };

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <EmptyState icon="📄" title="Sem dados no período" detail="Ajuste o filtro de período." />;
  return (
    <Card pad={false}>
      <div className="table-wrap px-0">
        <table className="data">
          <thead>
            <tr>{head.map((h, i) => <th key={h} className={i > 0 ? "text-right" : ""}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => <td key={j} className={j > 0 ? "num" : "font-medium"}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default async function ReportPage({ params, searchParams }: Params) {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "reports.read")) redirect("/");

  const { slug } = await params;
  const { periodo, de, ate } = await searchParams;
  const definition = REPORTS.find((r) => r.slug === slug);
  if (!definition) notFound();

  const period = resolvePeriod(periodo ?? "mes", de, ate);
  const companyId = user.companyId;

  let content: React.ReactNode = null;
  let stats: React.ReactNode = null;

  switch (slug) {
    case "vendas": {
      const data = await salesByPeriod(companyId, period);
      stats = (
        <>
          <StatCard label="Faturamento" value={brl(data.total)} hint={`${data.count} venda(s)`} />
          <StatCard label="Lucro bruto" value={brl(data.profit)} hint={`margem ${num(data.marginPct, 1)}%`} tone="green" />
          <StatCard label="Ticket médio" value={brl(data.ticket)} />
          <StatCard label="Descontos" value={brl(data.discount)} />
        </>
      );
      content = (
        <>
          <Table
            head={["Dia", "Vendas", "Faturamento", "Lucro"]}
            rows={data.days.map((d) => [
              new Date(`${d.date}T12:00:00`).toLocaleDateString("pt-BR"),
              d.count, brl(d.total), brl(d.profit),
            ])}
          />
          <h2 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-ink-500">Por forma de pagamento</h2>
          <Table
            head={["Forma", "Vendas", "Total"]}
            rows={data.byMethod.map((m) => [PAYMENT_METHOD_LABELS[m.method] ?? m.method, m.count, brl(m.total)])}
          />
        </>
      );
      break;
    }
    case "vendas-produto": {
      const rows = await salesByProduct(companyId, period);
      const total = rows.reduce((a, r) => a.plus(D(r.revenue)), ZERO);
      stats = <StatCard label="Faturamento" value={brl(total)} hint={`${rows.length} produto(s)`} />;
      content = (
        <Table
          head={["Produto", "Qtd", "Preço médio", "Faturamento", "Lucro", "Margem"]}
          rows={rows.map((r) => [r.name, num(r.quantity, 2), brl(r.avgPrice), brl(r.revenue), brl(r.profit), `${num(r.marginPct, 1)}%`])}
        />
      );
      break;
    }
    case "vendas-cliente": {
      const rows = await salesByCustomer(companyId, period);
      stats = <StatCard label="Clientes que compraram" value={rows.length} />;
      content = (
        <Table
          head={["Cliente", "Tipo", "Compras", "Total", "Ticket médio"]}
          rows={rows.map((r) => [r.name, CUSTOMER_TYPE_LABELS[r.type] ?? r.type, r.count, brl(r.total), brl(r.ticket)])}
        />
      );
      break;
    }
    case "vendas-vendedor": {
      const rows = await salesBySeller(companyId, period);
      content = (
        <Table
          head={["Vendedor", "Vendas", "Total", "Lucro", "Ticket médio"]}
          rows={rows.map((r) => [r.name, r.count, brl(r.total), brl(r.profit), brl(r.ticket)])}
        />
      );
      break;
    }
    case "margem": {
      const rows = (await salesByProduct(companyId, period)).sort((a, b) => b.marginPct.comparedTo(a.marginPct));
      const best = rows[0];
      const worst = rows[rows.length - 1];
      stats = (
        <>
          {best && <StatCard label="Maior margem" value={best.name} hint={`${num(best.marginPct, 1)}%`} tone="green" />}
          {worst && rows.length > 1 && <StatCard label="Menor margem" value={worst.name} hint={`${num(worst.marginPct, 1)}%`} tone="red" />}
        </>
      );
      content = (
        <Table
          head={["Produto", "Faturamento", "Custo", "Lucro", "Margem"]}
          rows={rows.map((r) => [r.name, brl(r.revenue), brl(r.cost), brl(r.profit), `${num(r.marginPct, 1)}%`])}
        />
      );
      break;
    }
    case "estoque": {
      const data = await stockReport(companyId);
      stats = (
        <>
          <StatCard label="Valor em estoque" value={brl(data.totalValue)} />
          <StatCard label="Itens críticos" value={data.criticalCount} tone={data.criticalCount > 0 ? "red" : "green"} />
        </>
      );
      content = (
        <Table
          head={["Item", "Tipo", "Saldo", "Mínimo", "Custo médio", "Valor"]}
          rows={data.rows.map((r) => [
            r.product.name,
            PRODUCT_KIND_LABELS[r.product.kind],
            `${num(r.quantity, 2)} ${r.product.unit.toLowerCase()}`,
            num(D(r.product.minStock), 2),
            brl(r.unitCost),
            brl(r.value),
          ])}
        />
      );
      break;
    }
    case "estoque-parado": {
      const rows = await idleStock(companyId, 60);
      const total = rows.reduce((a, r) => a.plus(D(r.value)), ZERO);
      stats = <StatCard label="Valor parado" value={brl(total)} hint={`${rows.length} item(ns)`} tone={rows.length > 0 ? "red" : "green"} />;
      content = (
        <Table
          head={["Item", "Saldo", "Custo médio", "Valor parado"]}
          rows={rows.map((r) => [r.product.name, `${num(r.quantity, 2)} ${r.product.unit.toLowerCase()}`, brl(r.unitCost), brl(r.value)])}
        />
      );
      break;
    }
    case "perdas": {
      const data = await lossesReport(companyId, period);
      stats = <StatCard label="Custo das perdas" value={brl(data.total)} tone={D(data.total).greaterThan(0) ? "red" : "green"} />;
      content = (
        <>
          <Table
            head={["Item", "Quantidade", "Custo"]}
            rows={data.byProduct.map((r) => [r.name, `${num(r.quantity, 2)} ${r.unit.toLowerCase()}`, brl(r.value)])}
          />
          <h2 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-ink-500">Lançamentos</h2>
          <Table
            head={["Data", "Item", "Qtd", "Custo", "Responsável"]}
            rows={data.movements.map((m) => [
              date(m.createdAt), m.product.name, num(D(m.quantity), 2), brl(m.totalCost), m.user?.name ?? "—",
            ])}
          />
        </>
      );
      break;
    }
    case "producao": {
      const data = await productionReport(companyId, period);
      stats = (
        <>
          <StatCard label="Produzido" value={num(data.totals.produced, 1)} hint={`${data.totals.runs} produção(ões)`} />
          <StatCard label="Custo total" value={brl(data.totals.cost)} hint={`${brl(data.totals.avgUnitCost)} por unidade`} />
          <StatCard label="Perdas" value={num(data.totals.loss, 1)} hint={`${num(data.totals.lossPct, 1)}% do produzido`} tone={D(data.totals.loss).greaterThan(0) ? "red" : "green"} />
        </>
      );
      content = (
        <Table
          head={["Data", "Produto", "Produzido", "Perdas", "Custo unit.", "Rendimento", "Lote"]}
          rows={data.orders.map((o) => [
            date(o.finishedAt), o.product.name, num(D(o.producedQty), 2), num(D(o.lossQty), 2),
            brl(o.unitCost), o.actualYieldPct ? `${num(D(o.actualYieldPct), 1)}%` : "—",
            o.batches[0]?.code ?? "—",
          ])}
        />
      );
      break;
    }
    case "rendimento": {
      const data = await yieldReport(companyId, period.from, period.to);
      content = (
        <>
          <Table
            head={["Produto", "Produções", "Entrada", "Produzido", "Rend. médio", "Melhor", "Pior", "Custo médio"]}
            rows={data.summary.map((s) => [
              s.name, s.runs, num(s.input, 1), num(s.produced, 1),
              s.avgYieldPct ? `${num(s.avgYieldPct, 1)}%` : "—",
              s.best ? `${num(s.best, 1)}%` : "—",
              s.worst ? `${num(s.worst, 1)}%` : "—",
              brl(s.avgUnitCost),
            ])}
          />
          <p className="mt-3 text-xs text-ink-500">
            O rendimento compara o produzido com a quantidade do ingrediente principal da ficha
            técnica. Ex.: 100 kg de banana que geram 30 kg de chips = 30% de rendimento.
          </p>
        </>
      );
      break;
    }
    case "compras": {
      const data = await purchasesReport(companyId, period);
      stats = <StatCard label="Total comprado" value={brl(data.total)} hint={`${data.orders.length} compra(s)`} />;
      content = (
        <Table
          head={["Data", "Número", "Fornecedor", "Itens", "Total"]}
          rows={data.orders.map((o) => [date(o.orderedAt), o.number, o.supplier.name, o.items.length, brl(o.total)])}
        />
      );
      break;
    }
    case "fornecedores": {
      const data = await purchasesReport(companyId, period);
      content = (
        <Table
          head={["Fornecedor", "Compras", "Total"]}
          rows={data.bySupplier.map((s) => [s.name, s.count, brl(s.total)])}
        />
      );
      break;
    }
    case "receber":
    case "pagar": {
      const direction = slug === "receber" ? "RECEIVABLE" : "PAYABLE";
      const data = await financeReport(companyId, period, direction);
      stats = (
        <>
          <StatCard label="Total no período" value={brl(data.total)} />
          <StatCard label="Em aberto" value={brl(data.outstanding)} />
          <StatCard label="Vencido" value={brl(data.overdue)} tone={D(data.overdue).greaterThan(0) ? "red" : "green"} />
          <StatCard label="Recebido/pago" value={brl(data.paid)} tone="green" />
        </>
      );
      content = (
        <>
          <Table
            head={["Categoria", "Total"]}
            rows={data.byCategory.map((c) => [c.name, brl(c.total)])}
          />
          <h2 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-ink-500">Títulos</h2>
          <Table
            head={["Vencimento", "Descrição", "Parceiro", "Valor", "Pago"]}
            rows={data.entries.map((e) => [
              date(e.dueDate), e.description,
              e.customer?.name ?? e.supplier?.name ?? "—",
              brl(e.amount), brl(e.paidAmount),
            ])}
          />
        </>
      );
      break;
    }
    case "fluxo-caixa": {
      const flow = await cashFlow(companyId, period.from, period.to);
      stats = (
        <>
          <StatCard label="Entradas" value={brl(flow.totals.inflow)} tone="green" />
          <StatCard label="Saídas" value={brl(flow.totals.outflow)} tone="red" />
          <StatCard label="Saldo" value={brl(flow.totals.net)} tone={flow.totals.net.greaterThanOrEqualTo(0) ? "green" : "red"} />
        </>
      );
      content = (
        <Table
          head={["Dia", "Entradas", "Saídas", "Saldo", "Acumulado"]}
          rows={flow.series.map((r) => [
            new Date(`${r.date}T12:00:00`).toLocaleDateString("pt-BR"),
            brl(r.inflow), brl(r.outflow), brl(r.net), brl(r.accumulated),
          ])}
        />
      );
      break;
    }
    default:
      notFound();
  }

  return (
    <div>
      <PageHeader
        title={definition.title}
        subtitle={`${definition.description} · ${period.label}`}
        action={<Link href="/relatorios" className="btn-ghost btn-sm no-print">Relatórios</Link>}
      />
      <div className="no-print"><PeriodFilter /></div>
      {stats && <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">{stats}</div>}
      <div className="mt-4">{content}</div>
    </div>
  );
}
