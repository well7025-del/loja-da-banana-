import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { brl, date } from "@/lib/format";
import { ORDER_FLOW, ORDER_STATUS_LABELS } from "@/lib/defaults";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const COLUMN_TONE: Record<string, string> = {
  NEW: "bg-sky-50 border-sky-200",
  CONFIRMED: "bg-violet-50 border-violet-200",
  PICKING: "bg-banana-50 border-banana-200",
  IN_PRODUCTION: "bg-orange-50 border-orange-200",
  READY: "bg-leaf-50 border-leaf-300",
  DISPATCHED: "bg-cyan-50 border-cyan-200",
  DELIVERED: "bg-ink-100 border-ink-200",
};

/** Quadro Kanban dos pedidos — rolagem horizontal no celular. */
export default async function OrdersPage() {
  const user = (await getCurrentUser())!;
  const orders = await prisma.order.findMany({
    where: { companyId: user.companyId, deletedAt: null, status: { not: "CANCELLED" } },
    include: { customer: true, items: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const byStatus = Object.fromEntries(
    ORDER_FLOW.map((status) => [status, orders.filter((o) => o.status === status)]),
  );

  return (
    <div>
      <PageHeader
        title="Pedidos"
        subtitle={`${orders.filter((o) => o.status !== "DELIVERED").length} em andamento`}
        action={can(user.permissions, "orders.create") ? (
          <Link href="/pedidos/novo" className="btn-banana btn-sm">+ Pedido</Link>
        ) : null}
      />

      {orders.length === 0 ? (
        <EmptyState
          icon="📋" title="Nenhum pedido em aberto"
          detail="Pedidos permitem separar, produzir e entregar antes de faturar a venda."
          action={<Link href="/pedidos/novo" className="btn-primary btn-sm">Criar pedido</Link>}
        />
      ) : (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4">
          {ORDER_FLOW.map((status) => (
            <div key={status} className="w-64 shrink-0">
              <div className={`mb-2 rounded-xl border px-3 py-2 ${COLUMN_TONE[status]}`}>
                <p className="text-sm font-bold text-ink-800">
                  {ORDER_STATUS_LABELS[status]}
                  <span className="ml-1.5 text-ink-500">{byStatus[status].length}</span>
                </p>
              </div>
              <div className="space-y-2">
                {byStatus[status].map((order) => (
                  <Link key={order.id} href={`/pedidos/${order.id}`} className="block">
                    <Card className="transition active:scale-[.99] hover:border-leaf-400">
                      <p className="truncate font-semibold text-ink-900">{order.customer.name}</p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {order.number} · {order.items.length} item(ns)
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-bold tabular-nums text-ink-900">{brl(order.total)}</span>
                        {order.deliveryDate && (
                          <span className="text-xs text-ink-500">{date(order.deliveryDate)}</span>
                        )}
                      </div>
                    </Card>
                  </Link>
                ))}
                {byStatus[status].length === 0 && (
                  <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-ink-400">
                    Vazio
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
