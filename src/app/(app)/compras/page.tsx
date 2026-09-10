import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { brl, date } from "@/lib/format";
import { PURCHASE_STATUS_LABELS } from "@/lib/defaults";
import { Badge, Card, EmptyState, PageHeader, type Tone } from "@/components/ui";
import { FilterPills } from "@/components/search-input";
import { can } from "@/lib/permissions";
import type { PurchaseStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const TONE: Record<string, Tone> = {
  DRAFT: "neutral", ORDERED: "blue", PARTIAL: "yellow", RECEIVED: "green", CANCELLED: "red",
};

export default async function PurchasesPage({
  searchParams,
}: { searchParams: Promise<{ status?: string }> }) {
  const user = (await getCurrentUser())!;
  const { status } = await searchParams;

  const purchases = await prisma.purchaseOrder.findMany({
    where: {
      companyId: user.companyId, deletedAt: null,
      ...(status ? { status: status as PurchaseStatus } : {}),
    },
    include: { supplier: true, items: true },
    orderBy: { orderedAt: "desc" },
    take: 80,
  });

  return (
    <div>
      <PageHeader
        title="Compras"
        subtitle="Pedidos ao fornecedor e recebimento"
        action={can(user.permissions, "purchases.create") ? (
          <Link href="/compras/nova" className="btn-banana btn-sm">+ Comprar</Link>
        ) : null}
      />

      <FilterPills
        paramName="status"
        options={Object.entries(PURCHASE_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
      />

      <div className="mt-3">
        {purchases.length === 0 ? (
          <EmptyState
            icon="🚚" title="Nenhuma compra registrada"
            detail="Ao receber a mercadoria, o estoque, o custo médio e a conta a pagar são atualizados automaticamente."
            action={<Link href="/compras/nova" className="btn-primary btn-sm">Registrar compra</Link>}
          />
        ) : (
          <Card pad={false}>
            {purchases.map((purchase) => (
              <Link key={purchase.id} href={`/compras/${purchase.id}`} className="block active:bg-ink-50">
                <div className="row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-ink-900">{purchase.supplier.name}</span>
                      <Badge tone={TONE[purchase.status]}>{PURCHASE_STATUS_LABELS[purchase.status]}</Badge>
                    </div>
                    <p className="truncate text-xs text-ink-500">
                      {purchase.number} · {date(purchase.orderedAt)} · {purchase.items.length} item(ns)
                    </p>
                  </div>
                  <span className="shrink-0 font-bold tabular-nums text-ink-900">{brl(purchase.total)}</span>
                </div>
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
