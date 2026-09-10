import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { D } from "@/lib/money";
import { brl, datetime, num } from "@/lib/format";
import { MOVEMENT_REASON_LABELS } from "@/lib/defaults";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterPills } from "@/components/search-input";
import type { MovementReason } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function MovementsPage({
  searchParams,
}: { searchParams: Promise<{ motivo?: string }> }) {
  const user = (await getCurrentUser())!;
  const { motivo } = await searchParams;

  const movements = await prisma.inventoryMovement.findMany({
    where: {
      companyId: user.companyId,
      ...(motivo ? { reason: motivo as MovementReason } : {}),
    },
    include: { product: true, user: { select: { name: true } }, batch: { select: { code: true } } },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  return (
    <div>
      <PageHeader title="Movimentações" subtitle="Últimos 150 lançamentos de estoque" />
      <FilterPills
        paramName="motivo"
        options={["PURCHASE", "PRODUCTION_IN", "PRODUCTION_OUT", "SALE", "LOSS", "ADJUSTMENT"].map((v) => ({
          value: v, label: MOVEMENT_REASON_LABELS[v],
        }))}
      />
      <div className="mt-3">
        {movements.length === 0 ? (
          <EmptyState icon="📄" title="Nenhuma movimentação" />
        ) : (
          <Card pad={false}>
            {movements.map((m) => (
              <Link key={m.id} href={`/estoque/${m.productId}`} className="block active:bg-ink-50">
                <div className="row">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">{m.product.name}</p>
                    <p className="truncate text-xs text-ink-500">
                      {MOVEMENT_REASON_LABELS[m.reason]} · {datetime(m.createdAt)}
                      {m.batch && ` · ${m.batch.code}`}
                      {m.user && ` · ${m.user.name}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`font-bold tabular-nums ${m.type === "IN" ? "text-leaf-700" : m.type === "OUT" ? "text-red-600" : "text-ink-700"}`}>
                      {m.type === "IN" ? "+" : m.type === "OUT" ? "−" : "±"}{num(D(m.quantity), 2)} {m.product.unit.toLowerCase()}
                    </p>
                    <p className="text-xs text-ink-500">{brl(m.totalCost)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
