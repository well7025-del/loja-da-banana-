import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { D } from "@/lib/money";
import { brl, date, num } from "@/lib/format";
import { FINANCE_STATUS_LABELS, PURCHASE_STATUS_LABELS } from "@/lib/defaults";
import { Badge, Card, FormMessage, PageHeader, SectionTitle } from "@/components/ui";
import { can } from "@/lib/permissions";
import { ReceivePurchaseForm } from "./receive";

export const dynamic = "force-dynamic";

export default async function PurchasePage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const user = (await getCurrentUser())!;
  const { id } = await params;
  const { ok } = await searchParams;

  const purchase = await prisma.purchaseOrder.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      supplier: true,
      items: { include: { product: true } },
      financeEntries: true,
    },
  });
  if (!purchase) notFound();

  const pending = purchase.items.filter((i) => D(i.receivedQty).lessThan(D(i.quantity)));
  const canReceive = can(user.permissions, "purchases.update") && pending.length > 0 && purchase.status !== "CANCELLED";

  return (
    <div>
      {ok === "1" && <div className="mb-3"><FormMessage success={`Compra ${purchase.number} registrada.`} /></div>}

      <PageHeader
        title={`Compra ${purchase.number}`}
        subtitle={purchase.supplier.name}
        action={<Badge tone={purchase.status === "RECEIVED" ? "green" : "yellow"}>
          {PURCHASE_STATUS_LABELS[purchase.status]}
        </Badge>}
      />

      <SectionTitle>Itens</SectionTitle>
      <Card pad={false}>
        {purchase.items.map((item) => (
          <div key={item.id} className="row">
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink-900">{item.product.name}</p>
              <p className="text-xs text-ink-500">
                {num(D(item.quantity), 3)} {item.product.unit.toLowerCase()} × {brl(item.unitPrice)}
                {" · recebido "}{num(D(item.receivedQty), 3)}
              </p>
            </div>
            <span className="shrink-0 font-semibold tabular-nums">{brl(item.total)}</span>
          </div>
        ))}
        <div className="row"><span className="text-ink-500">Subtotal</span><span className="font-semibold tabular-nums">{brl(purchase.subtotal)}</span></div>
        {D(purchase.freight).greaterThan(0) && (
          <div className="row"><span className="text-ink-500">Frete (rateado no custo)</span><span className="font-semibold tabular-nums">{brl(purchase.freight)}</span></div>
        )}
        {D(purchase.discount).greaterThan(0) && (
          <div className="row"><span className="text-ink-500">Desconto</span><span className="font-semibold tabular-nums">−{brl(purchase.discount)}</span></div>
        )}
        <div className="row bg-ink-50"><span className="font-bold">Total</span><span className="font-bold tabular-nums">{brl(purchase.total)}</span></div>
      </Card>

      {canReceive && (
        <>
          <SectionTitle>Receber mercadoria</SectionTitle>
          <ReceivePurchaseForm
            purchaseId={purchase.id}
            items={pending.map((i) => ({
              id: i.id,
              name: i.product.name,
              unit: i.product.unit,
              pending: D(i.quantity).minus(D(i.receivedQty)).toString(),
              trackBatches: i.product.trackBatches,
            }))}
          />
        </>
      )}

      <SectionTitle>Dados</SectionTitle>
      <Card pad={false}>
        <div className="row">
          <span className="text-ink-500">Fornecedor</span>
          <Link href={`/fornecedores/${purchase.supplier.id}`} className="font-semibold text-leaf-700">{purchase.supplier.name}</Link>
        </div>
        <div className="row"><span className="text-ink-500">Pedido em</span><span className="font-semibold">{date(purchase.orderedAt)}</span></div>
        {purchase.receivedAt && <div className="row"><span className="text-ink-500">Recebido em</span><span className="font-semibold">{date(purchase.receivedAt)}</span></div>}
        {purchase.dueDate && <div className="row"><span className="text-ink-500">Vencimento</span><span className="font-semibold">{date(purchase.dueDate)}</span></div>}
        {purchase.paymentTerms && <div className="row"><span className="text-ink-500">Condição</span><span className="font-semibold">{purchase.paymentTerms}</span></div>}
        {purchase.notes && <div className="row"><span className="text-ink-500">Observações</span><span className="max-w-[60%] text-right">{purchase.notes}</span></div>}
      </Card>

      {purchase.financeEntries.length > 0 && (
        <>
          <SectionTitle>Conta a pagar</SectionTitle>
          <Card pad={false}>
            {purchase.financeEntries.map((entry) => (
              <Link key={entry.id} href="/financeiro/pagar" className="block active:bg-ink-50">
                <div className="row">
                  <div>
                    <p className="font-medium text-ink-800">{entry.description}</p>
                    <p className="text-xs text-ink-500">Vence em {date(entry.dueDate)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{brl(entry.amount)}</p>
                    <p className="text-xs text-ink-500">{FINANCE_STATUS_LABELS[entry.status]}</p>
                  </div>
                </div>
              </Link>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
