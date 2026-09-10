import "server-only";
import { Prisma, prisma } from "@/lib/db";
import { D, money, pct, ZERO } from "@/lib/money";
import { brl } from "@/lib/format";
import { financeSummary } from "./finance";
import { getSettings } from "./settings";
import { num } from "@/lib/format";

export function dayRange(reference = new Date()) {
  const start = new Date(reference); start.setHours(0, 0, 0, 0);
  const end = new Date(reference); end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function monthRange(reference = new Date()) {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export async function getDashboard(companyId: string) {
  const now = new Date();
  const today = dayRange(now);
  const month = monthRange(now);
  const settings = await getSettings(companyId);
  const expiryDays = Number(settings.expiryAlertDays || 30);
  const expiryLimit = new Date(now.getTime() + expiryDays * 86400000);

  const [
    salesToday, salesMonth, finance, openOrders, productionToday,
    products, batchesExpiring, pendingProduction,
  ] = await Promise.all([
    prisma.sale.aggregate({
      where: { companyId, status: "COMPLETED", soldAt: { gte: today.start, lte: today.end } },
      _sum: { total: true, grossProfit: true }, _count: true,
    }),
    prisma.sale.aggregate({
      where: { companyId, status: "COMPLETED", soldAt: { gte: month.start, lte: month.end } },
      _sum: { total: true, grossProfit: true, costTotal: true }, _count: true,
    }),
    financeSummary(companyId, now),
    prisma.order.findMany({
      where: { companyId, deletedAt: null, status: { notIn: ["DELIVERED", "CANCELLED"] } },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.productionOrder.aggregate({
      where: { companyId, deletedAt: null, status: "FINISHED", finishedAt: { gte: today.start, lte: today.end } },
      _sum: { producedQty: true }, _count: true,
    }),
    prisma.product.findMany({
      where: { companyId, deletedAt: null, active: true },
      include: { inventory: true },
    }),
    prisma.batch.findMany({
      where: { companyId, availableQty: { gt: 0 }, expiresAt: { not: null, lte: expiryLimit } },
      include: { product: true },
      orderBy: { expiresAt: "asc" },
      take: 20,
    }),
    prisma.productionOrder.findMany({
      where: { companyId, deletedAt: null, status: { in: ["PLANNED", "IN_PROGRESS"] } },
      include: { product: true },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
  ]);

  const stock = products.map((p) => {
    const quantity = p.inventory.reduce((a, i) => a.plus(D(i.quantity)), ZERO);
    return {
      id: p.id, name: p.name, unit: p.unit, kind: p.kind,
      quantity, minStock: D(p.minStock), avgCost: D(p.avgCost),
      value: money(quantity.times(D(p.avgCost))),
      belowMin: D(p.minStock).greaterThan(0) && quantity.lessThan(D(p.minStock)),
    };
  });

  const criticalStock = stock.filter((s) => s.belowMin).sort((a, b) => a.quantity.comparedTo(b.quantity));
  const finishedStock = stock.filter((s) => s.kind === "FINISHED");
  const finishedQty = finishedStock.reduce((a, s) => a.plus(s.quantity), ZERO);
  const stockValue = stock.reduce((a, s) => a.plus(D(s.value)), ZERO);

  const monthRevenue = money(salesMonth._sum.total);
  const monthProfit = money(salesMonth._sum.grossProfit);

  return {
    salesToday: { total: money(salesToday._sum.total), profit: money(salesToday._sum.grossProfit), count: salesToday._count },
    salesMonth: {
      total: monthRevenue, profit: monthProfit, count: salesMonth._count,
      marginPct: monthRevenue.greaterThan(0) ? pct(monthProfit.dividedBy(monthRevenue).times(100)) : ZERO,
    },
    finance,
    openOrders,
    openOrdersCount: openOrders.length,
    productionToday: { qty: D(productionToday._sum.producedQty), count: productionToday._count },
    pendingProduction,
    criticalStock,
    finishedStock,
    finishedQty,
    stockValue: money(stockValue),
    batchesExpiring,
    expiryDays,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

export type Alert = {
  level: "danger" | "warning" | "info";
  icon: string;
  title: string;
  detail: string;
  href: string;
};

export async function getAlerts(companyId: string, data?: DashboardData): Promise<Alert[]> {
  const d = data ?? (await getDashboard(companyId));
  const alerts: Alert[] = [];

  if (d.criticalStock.length) {
    alerts.push({
      level: "danger", icon: "📦", title: `${d.criticalStock.length} item(ns) abaixo do estoque mínimo`,
      detail: d.criticalStock.slice(0, 3).map((s) => s.name).join(", "),
      href: "/estoque?filtro=critico",
    });
  }
  if (d.finance.overduePayableCount > 0) {
    alerts.push({
      level: "danger", icon: "💸", title: `${d.finance.overduePayableCount} conta(s) vencida(s) a pagar`,
      detail: `Total de ${brl(d.finance.overduePayable)}`,
      href: "/financeiro/pagar?filtro=vencidas",
    });
  }
  if (d.finance.overdueReceivableCount > 0) {
    alerts.push({
      level: "warning", icon: "🧾", title: `${d.finance.overdueReceivableCount} título(s) vencido(s) a receber`,
      detail: `Clientes inadimplentes: ${brl(d.finance.overdueReceivable)}`,
      href: "/financeiro/receber?filtro=vencidas",
    });
  }
  if (d.batchesExpiring.length) {
    alerts.push({
      level: "warning", icon: "⏳", title: `${d.batchesExpiring.length} lote(s) vencendo em ${d.expiryDays} dias`,
      detail: d.batchesExpiring.slice(0, 3).map((b) => `${b.product.name} (${b.code})`).join(", "),
      href: "/estoque/lotes",
    });
  }
  if (d.openOrdersCount > 0) {
    alerts.push({
      level: "info", icon: "🛒", title: `${d.openOrdersCount} pedido(s) em aberto`,
      detail: "Acompanhe o andamento no quadro de pedidos",
      href: "/pedidos",
    });
  }
  if (d.pendingProduction.length) {
    alerts.push({
      level: "info", icon: "🏭", title: `${d.pendingProduction.length} produção(ões) em andamento`,
      detail: d.pendingProduction
        .slice(0, 3)
        .map((p) => `${p.product.name} ${num(D(p.plannedQty), 0)} ${p.product.unit.toLowerCase()}`)
        .join(", "),
      href: "/producao",
    });
  }
  return alerts;
}

/** Série de vendas dos últimos N dias (para o gráfico do dashboard). */
export async function salesSeries(companyId: string, days = 14) {
  const from = new Date(); from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));
  const sales = await prisma.sale.findMany({
    where: { companyId, status: "COMPLETED", soldAt: { gte: from } },
    select: { soldAt: true, total: true, grossProfit: true },
  });
  const map = new Map<string, { total: Prisma.Decimal; profit: Prisma.Decimal }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(from); d.setDate(from.getDate() + i);
    map.set(d.toISOString().slice(0, 10), { total: ZERO, profit: ZERO });
  }
  for (const s of sales) {
    const k = s.soldAt.toISOString().slice(0, 10);
    const cur = map.get(k);
    if (cur) {
      cur.total = cur.total.plus(D(s.total));
      cur.profit = cur.profit.plus(D(s.grossProfit));
    }
  }
  return [...map.entries()].map(([date, v]) => ({ date, total: money(v.total), profit: money(v.profit) }));
}
