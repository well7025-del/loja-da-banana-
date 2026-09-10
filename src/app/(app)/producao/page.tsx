import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { D } from "@/lib/money";
import { brl, date, num } from "@/lib/format";
import { PRODUCTION_STATUS_LABELS } from "@/lib/defaults";
import { Badge, Card, EmptyState, PageHeader, StatCard, type Tone } from "@/components/ui";
import { FilterPills } from "@/components/search-input";
import { can } from "@/lib/permissions";
import { dayRange, monthRange } from "@/server/services/dashboard";
import type { ProductionStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, Tone> = {
  PLANNED: "blue", IN_PROGRESS: "yellow", FINISHED: "green", CANCELLED: "neutral",
};

export default async function ProductionPage({
  searchParams,
}: { searchParams: Promise<{ status?: string }> }) {
  const user = (await getCurrentUser())!;
  const { status } = await searchParams;
  const today = dayRange();
  const month = monthRange();

  const [orders, todayAgg, monthAgg] = await Promise.all([
    prisma.productionOrder.findMany({
      where: {
        companyId: user.companyId, deletedAt: null,
        ...(status ? { status: status as ProductionStatus } : {}),
      },
      include: { product: true, responsible: { select: { name: true } }, batches: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.productionOrder.aggregate({
      where: { companyId: user.companyId, status: "FINISHED", finishedAt: { gte: today.start, lte: today.end } },
      _sum: { producedQty: true },
    }),
    prisma.productionOrder.aggregate({
      where: { companyId: user.companyId, status: "FINISHED", finishedAt: { gte: month.start, lte: month.end } },
      _sum: { producedQty: true, lossQty: true, totalCost: true }, _count: true,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Produção"
        subtitle="Ordens, lotes e rendimento"
        action={
          can(user.permissions, "production.create") ? (
            <Link href="/producao/nova" className="btn-banana btn-sm">+ Produzir</Link>
          ) : null
        }
      />

      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="Hoje" value={num(D(todayAgg._sum.producedQty), 1)} hint="kg produzidos" />
        <StatCard label="No mês" value={num(D(monthAgg._sum.producedQty), 1)} hint={`${monthAgg._count} produção(ões)`} />
        <StatCard label="Perdas no mês" value={num(D(monthAgg._sum.lossQty), 1)} hint="kg" tone={D(monthAgg._sum.lossQty).greaterThan(0) ? "red" : "neutral"} />
      </div>

      <div className="mt-3">
        <FilterPills
          paramName="status"
          options={Object.entries(PRODUCTION_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Link href="/relatorios/rendimento" className="font-semibold text-leaf-700">Relatório de rendimento →</Link>
      </div>

      <div className="mt-3">
        {orders.length === 0 ? (
          <EmptyState
            icon="🏭" title="Nenhuma ordem de produção"
            detail="Registre uma produção para gerar lote, baixar matéria-prima e apurar o custo real."
            action={<Link href="/producao/nova" className="btn-primary btn-sm">Registrar produção</Link>}
          />
        ) : (
          <Card pad={false}>
            {orders.map((order) => (
              <Link key={order.id} href={`/producao/${order.id}`} className="block active:bg-ink-50">
                <div className="row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-ink-900">{order.product.name}</span>
                      <Badge tone={STATUS_TONE[order.status]}>{PRODUCTION_STATUS_LABELS[order.status]}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {order.code} · {date(order.finishedAt ?? order.createdAt)} · {order.responsible.name}
                      {order.batches[0] && ` · lote ${order.batches[0].code}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums text-ink-900">
                      {num(D(order.producedQty ?? order.plannedQty), 1)} {order.product.unit.toLowerCase()}
                    </p>
                    <p className="text-xs text-ink-500">
                      {order.status === "FINISHED"
                        ? `${brl(order.unitCost)}/${order.product.unit.toLowerCase()}${order.actualYieldPct ? ` · ${num(D(order.actualYieldPct), 0)}%` : ""}`
                        : "planejado"}
                    </p>
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
