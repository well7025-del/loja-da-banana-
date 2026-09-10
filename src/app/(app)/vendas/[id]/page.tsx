import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { D } from "@/lib/money";
import { brl, date, datetime, num } from "@/lib/format";
import { FINANCE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/defaults";
import { Badge, Card, FormMessage, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { can } from "@/lib/permissions";
import { CancelSaleButton } from "./cancel";

export const dynamic = "force-dynamic";

export default async function SalePage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const user = (await getCurrentUser())!;
  const { id } = await params;
  const { ok } = await searchParams;

  const sale = await prisma.sale.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      customer: true,
      seller: { select: { name: true } },
      items: { include: { product: true } },
      financeEntries: { orderBy: { installment: "asc" } },
      order: true,
    },
  });
  if (!sale) notFound();

  return (
    <div>
      {ok === "1" && (
        <div className="mb-3">
          <FormMessage success={`Venda ${sale.number} registrada com sucesso.`} />
        </div>
      )}

      <PageHeader
        title={`Venda ${sale.number}`}
        subtitle={`${datetime(sale.soldAt)} · ${sale.seller?.name ?? "—"}`}
        action={sale.status === "CANCELLED" ? <Badge tone="red">cancelada</Badge> : <Badge tone="green">concluída</Badge>}
      />

      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="Total" value={brl(sale.total)} />
        <StatCard label="Custo" value={brl(sale.costTotal)} />
        <StatCard label="Lucro bruto" value={brl(sale.grossProfit)} hint={`${num(D(sale.marginPct), 1)}% de margem`} tone="green" />
      </div>

      <SectionTitle>Itens</SectionTitle>
      <Card pad={false}>
        {sale.items.map((item) => (
          <div key={item.id} className="row">
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink-900">{item.product.name}</p>
              <p className="text-xs text-ink-500">
                {num(D(item.quantity), 3)} {item.product.unit.toLowerCase()} × {brl(item.unitPrice)}
                {D(item.discountPct).greaterThan(0) && ` · −${num(D(item.discountPct), 1)}%`}
              </p>
            </div>
            <span className="shrink-0 font-semibold tabular-nums">{brl(item.total)}</span>
          </div>
        ))}
        <div className="row"><span className="text-ink-500">Subtotal</span><span className="font-semibold tabular-nums">{brl(sale.subtotal)}</span></div>
        {D(sale.discount).greaterThan(0) && (
          <div className="row"><span className="text-ink-500">Descontos</span><span className="font-semibold tabular-nums text-leaf-700">−{brl(sale.discount)}</span></div>
        )}
        {D(sale.freight).greaterThan(0) && (
          <div className="row"><span className="text-ink-500">Frete</span><span className="font-semibold tabular-nums">{brl(sale.freight)}</span></div>
        )}
        <div className="row bg-ink-50"><span className="font-bold">Total</span><span className="font-bold tabular-nums">{brl(sale.total)}</span></div>
      </Card>

      <SectionTitle>Dados</SectionTitle>
      <Card pad={false}>
        <div className="row">
          <span className="text-ink-500">Cliente</span>
          {sale.customer ? (
            <Link href={`/clientes/${sale.customer.id}`} className="font-semibold text-leaf-700">{sale.customer.name}</Link>
          ) : (
            <span className="font-semibold">Consumidor no balcão</span>
          )}
        </div>
        <div className="row"><span className="text-ink-500">Pagamento</span><span className="font-semibold">{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</span></div>
        <div className="row"><span className="text-ink-500">Canal</span><span className="font-semibold">{sale.channel === "WHOLESALE" ? "Atacado" : "Varejo"}</span></div>
        {sale.order && (
          <div className="row">
            <span className="text-ink-500">Pedido de origem</span>
            <Link href={`/pedidos/${sale.order.id}`} className="font-semibold text-leaf-700">{sale.order.number}</Link>
          </div>
        )}
        {sale.notes && <div className="row"><span className="text-ink-500">Observações</span><span className="max-w-[60%] text-right">{sale.notes}</span></div>}
        {sale.cancelReason && <div className="row"><span className="text-ink-500">Motivo do cancelamento</span><span className="max-w-[60%] text-right text-red-700">{sale.cancelReason}</span></div>}
      </Card>

      {sale.financeEntries.length > 0 && (
        <>
          <SectionTitle>Financeiro</SectionTitle>
          <Card pad={false}>
            {sale.financeEntries.map((entry) => (
              <div key={entry.id} className="row">
                <div>
                  <p className="font-medium text-ink-800">{entry.description}</p>
                  <p className="text-xs text-ink-500">Vence em {date(entry.dueDate)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{brl(entry.amount)}</p>
                  <p className={`text-xs font-semibold ${entry.status === "PAID" ? "text-leaf-700" : entry.status === "CANCELLED" ? "text-ink-400" : "text-banana-700"}`}>
                    {FINANCE_STATUS_LABELS[entry.status]}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      {sale.status === "COMPLETED" && can(user.permissions, "sales.delete") && (
        <div className="mt-4">
          <CancelSaleButton saleId={sale.id} />
        </div>
      )}
    </div>
  );
}
