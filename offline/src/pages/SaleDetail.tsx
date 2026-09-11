import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { D } from "@/lib/money";
import { brl, date, datetime, num } from "@/lib/format";
import { FINANCE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/defaults";
import { cancelSale } from "@/logic/sales";
import { Badge, Card, Message, PageHeader, SectionTitle, Spinner, StatCard } from "@/components/ui";

export default function SaleDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    if (!id) return null;
    const sale = await db.sales.get(id);
    if (!sale) return null;
    const [customer, products, entries] = await Promise.all([
      sale.customerId ? db.customers.get(sale.customerId) : Promise.resolve(undefined),
      db.products.bulkGet(sale.items.map((i) => i.productId)),
      db.finance.where("saleId").equals(sale.id).toArray(),
    ]);
    const byId = new Map(
      products.filter((p): p is NonNullable<typeof p> => Boolean(p)).map((p) => [p.id, p]),
    );
    return { sale, customer, byId, entries: entries.sort((a, b) => a.installment - b.installment) };
  }, [id]);

  if (data === undefined) return <Spinner />;
  if (!data?.sale) return <p className="py-8 text-center text-sm text-ink-500">Venda não encontrada.</p>;

  const { sale, customer, byId, entries } = data;

  async function cancelar() {
    const reason = window.prompt(
      "Motivo do cancelamento:\n\nO estoque será devolvido e os títulos em aberto, cancelados.",
    );
    if (reason === null) return;
    try {
      await cancelSale(sale.id, reason || "Sem motivo informado");
      setNotice("Venda cancelada e estoque estornado.");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      {params.get("nova") === "1" && (
        <div className="mb-3"><Message success={`Venda ${sale.number} registrada com sucesso.`} /></div>
      )}
      {(error || notice) && <div className="mb-3"><Message error={error} success={notice} /></div>}

      <PageHeader title={`Venda ${sale.number}`} subtitle={datetime(sale.soldAt)}
        action={sale.status === "CANCELLED"
          ? <Badge tone="red">cancelada</Badge>
          : <Badge tone="green">concluída</Badge>} />

      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="Total" value={brl(sale.total)} />
        <StatCard label="Custo" value={brl(sale.costTotal)} />
        <StatCard label="Lucro bruto" value={brl(sale.grossProfit)} tone="green"
          hint={`${num(D(sale.marginPct), 1)}% de margem`} />
      </div>

      <SectionTitle>Itens</SectionTitle>
      <Card pad={false}>
        {sale.items.map((item, index) => {
          const product = byId.get(item.productId);
          return (
            <div key={index} className="row">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink-900">{product?.name ?? "(removido)"}</p>
                <p className="text-xs text-ink-500">
                  {num(D(item.quantity), 3)} {product?.unit.toLowerCase()} × {brl(item.unitPrice)}
                  {D(item.discountPct).greaterThan(0) && ` · −${num(D(item.discountPct), 1)}%`}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{brl(item.total)}</span>
            </div>
          );
        })}
        <div className="row"><span className="text-ink-500">Subtotal</span>
          <span className="font-semibold tabular-nums">{brl(sale.subtotal)}</span></div>
        {D(sale.discount).greaterThan(0) && (
          <div className="row"><span className="text-ink-500">Descontos</span>
            <span className="font-semibold tabular-nums text-leaf-700">−{brl(sale.discount)}</span></div>
        )}
        {D(sale.freight).greaterThan(0) && (
          <div className="row"><span className="text-ink-500">Frete</span>
            <span className="font-semibold tabular-nums">{brl(sale.freight)}</span></div>
        )}
        <div className="row bg-ink-50"><span className="font-bold">Total</span>
          <span className="font-bold tabular-nums">{brl(sale.total)}</span></div>
      </Card>

      <SectionTitle>Dados</SectionTitle>
      <Card pad={false}>
        <div className="row">
          <span className="text-ink-500">Cliente</span>
          {customer
            ? <Link to={`/clientes/${customer.id}`} className="font-semibold text-leaf-700">{customer.name}</Link>
            : <span className="font-semibold">Consumidor no balcão</span>}
        </div>
        <div className="row"><span className="text-ink-500">Pagamento</span>
          <span className="font-semibold">{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</span></div>
        <div className="row"><span className="text-ink-500">Canal</span>
          <span className="font-semibold">{sale.channel === "WHOLESALE" ? "Atacado" : "Varejo"}</span></div>
        {sale.notes && (
          <div className="row"><span className="text-ink-500">Observações</span>
            <span className="max-w-[60%] text-right">{sale.notes}</span></div>
        )}
        {sale.cancelReason && (
          <div className="row"><span className="text-ink-500">Motivo do cancelamento</span>
            <span className="max-w-[60%] text-right text-red-700">{sale.cancelReason}</span></div>
        )}
      </Card>

      {entries.length > 0 && (
        <>
          <SectionTitle>Financeiro</SectionTitle>
          <Card pad={false}>
            {entries.map((entry) => (
              <div key={entry.id} className="row">
                <div>
                  <p className="font-medium text-ink-800">{entry.description}</p>
                  <p className="text-xs text-ink-500">Vence em {date(entry.dueDate)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{brl(entry.amount)}</p>
                  <p className={`text-xs font-semibold ${
                    entry.status === "PAID" ? "text-leaf-700"
                      : entry.status === "CANCELLED" ? "text-ink-400" : "text-banana-700"
                  }`}>{FINANCE_STATUS_LABELS[entry.status]}</p>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      {sale.status === "COMPLETED" && (
        <button type="button" onClick={() => void cancelar()} className="btn-ghost mt-4 w-full !text-red-600">
          Cancelar venda
        </button>
      )}
    </div>
  );
}
