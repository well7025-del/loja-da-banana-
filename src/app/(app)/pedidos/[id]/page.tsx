import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { D, ZERO } from "@/lib/money";
import { brl, date, num } from "@/lib/format";
import { ORDER_FLOW, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/defaults";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";
import { can } from "@/lib/permissions";
import { OrderActions } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = (await getCurrentUser())!;
  const { id } = await params;

  const order = await prisma.order.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      customer: true,
      items: { include: { product: { include: { inventory: true } } } },
      sale: { select: { id: true, number: true } },
    },
  });
  if (!order) notFound();

  const currentIndex = ORDER_FLOW.indexOf(order.status as (typeof ORDER_FLOW)[number]);
  const nextStatus = currentIndex >= 0 && currentIndex < ORDER_FLOW.length - 1 ? ORDER_FLOW[currentIndex + 1] : null;

  return (
    <div>
      <PageHeader
        title={`Pedido ${order.number}`}
        subtitle={order.customer.name}
        action={<Badge tone={order.status === "DELIVERED" ? "green" : order.status === "CANCELLED" ? "red" : "yellow"}>
          {ORDER_STATUS_LABELS[order.status]}
        </Badge>}
      />

      {/* Linha do tempo */}
      <div className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4">
        {ORDER_FLOW.map((status, index) => (
          <div
            key={status}
            className={`flex-1 shrink-0 rounded-lg px-2 py-1.5 text-center text-[0.65rem] font-bold ${
              index <= currentIndex ? "bg-leaf-600 text-white" : "bg-ink-100 text-ink-400"
            }`}
          >
            {ORDER_STATUS_LABELS[status]}
          </div>
        ))}
      </div>

      <SectionTitle>Itens</SectionTitle>
      <Card pad={false}>
        {order.items.map((item) => {
          const stock = item.product.inventory.reduce((a, i) => a.plus(D(i.quantity)), ZERO);
          const short = stock.lessThan(D(item.quantity));
          return (
            <div key={item.id} className="row">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink-900">{item.product.name}</p>
                <p className="text-xs text-ink-500">
                  {num(D(item.quantity), 3)} {item.product.unit.toLowerCase()} × {brl(item.unitPrice)}
                  {short && <span className="font-semibold text-red-600"> · estoque {num(stock, 1)}</span>}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{brl(item.total)}</span>
            </div>
          );
        })}
        <div className="row bg-ink-50"><span className="font-bold">Total</span><span className="font-bold tabular-nums">{brl(order.total)}</span></div>
      </Card>

      <SectionTitle>Entrega e pagamento</SectionTitle>
      <Card pad={false}>
        <div className="row">
          <span className="text-ink-500">Cliente</span>
          <Link href={`/clientes/${order.customer.id}`} className="font-semibold text-leaf-700">{order.customer.name}</Link>
        </div>
        <div className="row"><span className="text-ink-500">Pagamento</span><span className="font-semibold">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</span></div>
        {order.deliveryDate && <div className="row"><span className="text-ink-500">Entrega prevista</span><span className="font-semibold">{date(order.deliveryDate)}</span></div>}
        {order.deliveryAddress && <div className="row"><span className="text-ink-500">Endereço</span><span className="max-w-[60%] text-right">{order.deliveryAddress}</span></div>}
        <div className="row">
          <span className="text-ink-500">Estoque reservado</span>
          <span className="font-semibold">{order.reserved ? "Sim" : "Não"}</span>
        </div>
        {order.sale && (
          <div className="row">
            <span className="text-ink-500">Venda faturada</span>
            <Link href={`/vendas/${order.sale.id}`} className="font-semibold text-leaf-700">{order.sale.number}</Link>
          </div>
        )}
        {order.notes && <div className="row"><span className="text-ink-500">Observações</span><span className="max-w-[60%] text-right">{order.notes}</span></div>}
      </Card>

      <div className="mt-4">
        <OrderActions
          orderId={order.id}
          status={order.status}
          nextStatus={nextStatus}
          nextLabel={nextStatus ? ORDER_STATUS_LABELS[nextStatus] : null}
          alreadyInvoiced={Boolean(order.sale)}
          canUpdate={can(user.permissions, "orders.update")}
          canInvoice={can(user.permissions, "sales.create")}
          canCancel={can(user.permissions, "orders.delete")}
        />
      </div>
    </div>
  );
}
