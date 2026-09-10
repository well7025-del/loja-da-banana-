import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { D } from "@/lib/money";
import { brl, datetime, num } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/defaults";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { SearchInput } from "@/components/search-input";
import { can } from "@/lib/permissions";
import { dayRange, monthRange } from "@/server/services/dashboard";

export const dynamic = "force-dynamic";

export default async function SalesPage({
  searchParams,
}: { searchParams: Promise<{ q?: string }> }) {
  const user = (await getCurrentUser())!;
  const { q } = await searchParams;
  const today = dayRange();
  const month = monthRange();

  const [sales, todayAgg, monthAgg] = await Promise.all([
    prisma.sale.findMany({
      where: {
        companyId: user.companyId,
        ...(q
          ? {
              OR: [
                { number: { contains: q, mode: "insensitive" as const } },
                { customer: { name: { contains: q, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      include: { customer: true, seller: { select: { name: true } }, items: true },
      orderBy: { soldAt: "desc" },
      take: 80,
    }),
    prisma.sale.aggregate({
      where: { companyId: user.companyId, status: "COMPLETED", soldAt: { gte: today.start, lte: today.end } },
      _sum: { total: true, grossProfit: true }, _count: true,
    }),
    prisma.sale.aggregate({
      where: { companyId: user.companyId, status: "COMPLETED", soldAt: { gte: month.start, lte: month.end } },
      _sum: { total: true, grossProfit: true }, _count: true,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Vendas"
        action={
          can(user.permissions, "sales.create") ? (
            <Link href="/vendas/nova" className="btn-banana btn-sm">+ Vender</Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Hoje" value={brl(todayAgg._sum.total)} hint={`${todayAgg._count} venda(s) · lucro ${brl(todayAgg._sum.grossProfit)}`} />
        <StatCard label="No mês" value={brl(monthAgg._sum.total)} hint={`${monthAgg._count} venda(s) · lucro ${brl(monthAgg._sum.grossProfit)}`} tone="green" />
      </div>

      <div className="mt-3"><SearchInput placeholder="Buscar por número ou cliente" /></div>

      <div className="mt-3">
        {sales.length === 0 ? (
          <EmptyState
            icon="🛒" title="Nenhuma venda registrada"
            action={<Link href="/vendas/nova" className="btn-primary btn-sm">Registrar venda</Link>}
          />
        ) : (
          <Card pad={false}>
            {sales.map((sale) => (
              <Link key={sale.id} href={`/vendas/${sale.id}`} className="block active:bg-ink-50">
                <div className="row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-ink-900">
                        {sale.customer?.name ?? "Consumidor no balcão"}
                      </span>
                      {sale.status === "CANCELLED" && <Badge tone="red">cancelada</Badge>}
                    </div>
                    <p className="truncate text-xs text-ink-500">
                      {sale.number} · {datetime(sale.soldAt)} · {PAYMENT_METHOD_LABELS[sale.paymentMethod]}
                      {" · "}{sale.items.length} item(ns)
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`font-bold tabular-nums ${sale.status === "CANCELLED" ? "text-ink-400 line-through" : "text-ink-900"}`}>
                      {brl(sale.total)}
                    </p>
                    <p className="text-xs text-ink-500">margem {num(D(sale.marginPct), 1)}%</p>
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
