import "server-only";
import { Prisma, prisma } from "@/lib/db";
import { D, money, qty, pct, ZERO } from "@/lib/money";

const HUNDRED = new Prisma.Decimal(100);

export type Period = { from: Date; to: Date; label: string };

export function resolvePeriod(preset?: string, fromStr?: string, toStr?: string): Period {
  const now = new Date();
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

  switch (preset) {
    case "hoje":
      return { from: startOfDay(now), to: endOfDay(now), label: "Hoje" };
    case "semana": {
      const from = startOfDay(now);
      from.setDate(now.getDate() - now.getDay());
      return { from, to: endOfDay(now), label: "Esta semana" };
    }
    case "ano":
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now), label: "Este ano" };
    case "personalizado":
      if (fromStr && toStr) {
        return {
          from: startOfDay(new Date(fromStr)),
          to: endOfDay(new Date(toStr)),
          label: `${new Date(fromStr).toLocaleDateString("pt-BR")} a ${new Date(toStr).toLocaleDateString("pt-BR")}`,
        };
      }
    // fallthrough
    case "mes":
    default:
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: endOfDay(now),
        label: "Este mês",
      };
  }
}

export const PERIOD_PRESETS = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
  { value: "ano", label: "Ano" },
  { value: "personalizado", label: "Período" },
];

export async function salesByPeriod(companyId: string, p: Period) {
  const sales = await prisma.sale.findMany({
    where: { companyId, status: "COMPLETED", soldAt: { gte: p.from, lte: p.to } },
    select: { soldAt: true, total: true, grossProfit: true, costTotal: true, discount: true, paymentMethod: true },
    orderBy: { soldAt: "asc" },
  });

  const byDay = new Map<string, { date: string; total: Prisma.Decimal; profit: Prisma.Decimal; count: number }>();
  const byMethod = new Map<string, { total: Prisma.Decimal; count: number }>();
  let total = ZERO, profit = ZERO, cost = ZERO, discount = ZERO;

  for (const s of sales) {
    const k = s.soldAt.toISOString().slice(0, 10);
    const day = byDay.get(k) ?? { date: k, total: ZERO, profit: ZERO, count: 0 };
    day.total = day.total.plus(D(s.total));
    day.profit = day.profit.plus(D(s.grossProfit));
    day.count += 1;
    byDay.set(k, day);

    const m = byMethod.get(s.paymentMethod) ?? { total: ZERO, count: 0 };
    m.total = m.total.plus(D(s.total));
    m.count += 1;
    byMethod.set(s.paymentMethod, m);

    total = total.plus(D(s.total));
    profit = profit.plus(D(s.grossProfit));
    cost = cost.plus(D(s.costTotal));
    discount = discount.plus(D(s.discount));
  }

  return {
    days: [...byDay.values()].map((d) => ({ ...d, total: money(d.total), profit: money(d.profit) })),
    byMethod: [...byMethod.entries()].map(([method, v]) => ({ method, total: money(v.total), count: v.count })),
    total: money(total), profit: money(profit), cost: money(cost), discount: money(discount),
    count: sales.length,
    ticket: sales.length ? money(total.dividedBy(sales.length)) : ZERO,
    marginPct: total.greaterThan(0) ? pct(profit.dividedBy(total).times(HUNDRED)) : ZERO,
  };
}

export async function salesByProduct(companyId: string, p: Period) {
  const items = await prisma.saleItem.findMany({
    where: { sale: { companyId, status: "COMPLETED", soldAt: { gte: p.from, lte: p.to } } },
    include: { product: { select: { id: true, name: true, unit: true, kind: true } } },
  });

  const map = new Map<string, {
    id: string; name: string; unit: string; quantity: Prisma.Decimal;
    revenue: Prisma.Decimal; cost: Prisma.Decimal; orders: number;
  }>();
  for (const i of items) {
    const cur = map.get(i.productId) ?? {
      id: i.productId, name: i.product.name, unit: i.product.unit,
      quantity: ZERO, revenue: ZERO, cost: ZERO, orders: 0,
    };
    cur.quantity = cur.quantity.plus(D(i.quantity));
    cur.revenue = cur.revenue.plus(D(i.total));
    cur.cost = cur.cost.plus(D(i.totalCost));
    cur.orders += 1;
    map.set(i.productId, cur);
  }

  return [...map.values()]
    .map((r) => ({
      ...r,
      quantity: qty(r.quantity),
      revenue: money(r.revenue),
      cost: money(r.cost),
      profit: money(r.revenue.minus(r.cost)),
      marginPct: r.revenue.greaterThan(0) ? pct(r.revenue.minus(r.cost).dividedBy(r.revenue).times(HUNDRED)) : ZERO,
      avgPrice: r.quantity.greaterThan(0) ? money(r.revenue.dividedBy(r.quantity)) : ZERO,
    }))
    .sort((a, b) => b.revenue.comparedTo(a.revenue));
}

export async function salesByCustomer(companyId: string, p: Period) {
  const sales = await prisma.sale.findMany({
    where: { companyId, status: "COMPLETED", soldAt: { gte: p.from, lte: p.to } },
    include: { customer: { select: { id: true, name: true, type: true, city: true } } },
  });

  const map = new Map<string, {
    id: string; name: string; type: string; count: number;
    total: Prisma.Decimal; profit: Prisma.Decimal; lastAt: Date;
  }>();
  for (const s of sales) {
    const id = s.customer?.id ?? "__balcao__";
    const cur = map.get(id) ?? {
      id, name: s.customer?.name ?? "Consumidor no balcão",
      type: s.customer?.type ?? "CONSUMER", count: 0, total: ZERO, profit: ZERO, lastAt: s.soldAt,
    };
    cur.count += 1;
    cur.total = cur.total.plus(D(s.total));
    cur.profit = cur.profit.plus(D(s.grossProfit));
    if (s.soldAt > cur.lastAt) cur.lastAt = s.soldAt;
    map.set(id, cur);
  }

  return [...map.values()]
    .map((c) => ({
      ...c, total: money(c.total), profit: money(c.profit),
      ticket: c.count ? money(c.total.dividedBy(c.count)) : ZERO,
    }))
    .sort((a, b) => b.total.comparedTo(a.total));
}

export async function salesBySeller(companyId: string, p: Period) {
  const sales = await prisma.sale.findMany({
    where: { companyId, status: "COMPLETED", soldAt: { gte: p.from, lte: p.to } },
    include: { seller: { select: { id: true, name: true } } },
  });
  const map = new Map<string, { id: string; name: string; count: number; total: Prisma.Decimal; profit: Prisma.Decimal }>();
  for (const s of sales) {
    const id = s.seller?.id ?? "—";
    const cur = map.get(id) ?? { id, name: s.seller?.name ?? "Sem vendedor", count: 0, total: ZERO, profit: ZERO };
    cur.count += 1;
    cur.total = cur.total.plus(D(s.total));
    cur.profit = cur.profit.plus(D(s.grossProfit));
    map.set(id, cur);
  }
  return [...map.values()]
    .map((s) => ({ ...s, total: money(s.total), profit: money(s.profit), ticket: s.count ? money(s.total.dividedBy(s.count)) : ZERO }))
    .sort((a, b) => b.total.comparedTo(a.total));
}

export async function stockReport(companyId: string) {
  const products = await prisma.product.findMany({
    where: { companyId, deletedAt: null },
    include: { inventory: true, category: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });

  const rows = products.map((p) => {
    const quantity = p.inventory.reduce((a, i) => a.plus(D(i.quantity)), ZERO);
    const reserved = p.inventory.reduce((a, i) => a.plus(D(i.reserved)), ZERO);
    return {
      product: p,
      quantity: qty(quantity),
      reserved: qty(reserved),
      available: qty(quantity.minus(reserved)),
      unitCost: D(p.avgCost),
      value: money(quantity.times(D(p.avgCost))),
      belowMin: D(p.minStock).greaterThan(0) && quantity.lessThan(D(p.minStock)),
    };
  });

  return {
    rows,
    totalValue: money(rows.reduce((a, r) => a.plus(D(r.value)), ZERO)),
    criticalCount: rows.filter((r) => r.belowMin).length,
  };
}

/** Itens sem movimentação no período informado. */
export async function idleStock(companyId: string, days = 60) {
  const since = new Date(Date.now() - days * 86400000);
  const moved = await prisma.inventoryMovement.groupBy({
    by: ["productId"], where: { companyId, createdAt: { gte: since } }, _count: true,
  });
  const movedIds = new Set(moved.map((m) => m.productId));
  const { rows } = await stockReport(companyId);
  return rows.filter((r) => !movedIds.has(r.product.id) && D(r.quantity).greaterThan(0));
}

export async function productionReport(companyId: string, p: Period) {
  const orders = await prisma.productionOrder.findMany({
    where: { companyId, deletedAt: null, status: "FINISHED", finishedAt: { gte: p.from, lte: p.to } },
    include: { product: true, responsible: { select: { name: true } }, batches: true },
    orderBy: { finishedAt: "desc" },
  });

  const produced = orders.reduce((a, o) => a.plus(D(o.producedQty)), ZERO);
  const loss = orders.reduce((a, o) => a.plus(D(o.lossQty)), ZERO);
  const cost = orders.reduce((a, o) => a.plus(D(o.totalCost)), ZERO);

  return {
    orders,
    totals: {
      runs: orders.length,
      produced: qty(produced),
      loss: qty(loss),
      cost: money(cost),
      avgUnitCost: produced.greaterThan(0) ? qty(cost.dividedBy(produced)) : ZERO,
      lossPct: produced.plus(loss).greaterThan(0) ? pct(loss.dividedBy(produced.plus(loss)).times(HUNDRED)) : ZERO,
    },
  };
}

export async function lossesReport(companyId: string, p: Period) {
  const movements = await prisma.inventoryMovement.findMany({
    where: { companyId, reason: "LOSS", createdAt: { gte: p.from, lte: p.to } },
    include: { product: true, user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const total = movements.reduce((a, m) => a.plus(D(m.totalCost)), ZERO);
  const byProduct = new Map<string, { name: string; unit: string; quantity: Prisma.Decimal; value: Prisma.Decimal }>();
  for (const m of movements) {
    const cur = byProduct.get(m.productId) ?? { name: m.product.name, unit: m.product.unit, quantity: ZERO, value: ZERO };
    cur.quantity = cur.quantity.plus(D(m.quantity));
    cur.value = cur.value.plus(D(m.totalCost));
    byProduct.set(m.productId, cur);
  }
  return {
    movements,
    total: money(total),
    byProduct: [...byProduct.values()]
      .map((x) => ({ ...x, quantity: qty(x.quantity), value: money(x.value) }))
      .sort((a, b) => b.value.comparedTo(a.value)),
  };
}

export async function purchasesReport(companyId: string, p: Period) {
  const orders = await prisma.purchaseOrder.findMany({
    where: { companyId, deletedAt: null, orderedAt: { gte: p.from, lte: p.to }, status: { not: "CANCELLED" } },
    include: { supplier: true, items: { include: { product: true } } },
    orderBy: { orderedAt: "desc" },
  });

  const bySupplier = new Map<string, { id: string; name: string; count: number; total: Prisma.Decimal }>();
  for (const o of orders) {
    const cur = bySupplier.get(o.supplierId) ?? { id: o.supplierId, name: o.supplier.name, count: 0, total: ZERO };
    cur.count += 1;
    cur.total = cur.total.plus(D(o.total));
    bySupplier.set(o.supplierId, cur);
  }

  return {
    orders,
    total: money(orders.reduce((a, o) => a.plus(D(o.total)), ZERO)),
    bySupplier: [...bySupplier.values()]
      .map((s) => ({ ...s, total: money(s.total) }))
      .sort((a, b) => b.total.comparedTo(a.total)),
  };
}

export async function financeReport(companyId: string, p: Period, direction: "PAYABLE" | "RECEIVABLE") {
  const entries = await prisma.financeEntry.findMany({
    where: { companyId, direction, deletedAt: null, dueDate: { gte: p.from, lte: p.to } },
    include: { category: true, customer: true, supplier: true },
    orderBy: { dueDate: "asc" },
  });
  const open = entries.filter((e) => e.status === "OPEN" || e.status === "PARTIAL");
  const outstanding = open.reduce((a, e) => a.plus(D(e.amount).minus(D(e.paidAmount))), ZERO);
  const paid = entries.reduce((a, e) => a.plus(D(e.paidAmount)), ZERO);

  const byCategory = new Map<string, { name: string; total: Prisma.Decimal }>();
  for (const e of entries) {
    const name = e.category?.name ?? "Sem categoria";
    const cur = byCategory.get(name) ?? { name, total: ZERO };
    cur.total = cur.total.plus(D(e.amount));
    byCategory.set(name, cur);
  }

  return {
    entries,
    total: money(entries.reduce((a, e) => a.plus(D(e.amount)), ZERO)),
    outstanding: money(outstanding),
    paid: money(paid),
    overdue: money(
      open.filter((e) => e.dueDate < new Date()).reduce((a, e) => a.plus(D(e.amount).minus(D(e.paidAmount))), ZERO),
    ),
    byCategory: [...byCategory.values()]
      .map((c) => ({ ...c, total: money(c.total) }))
      .sort((a, b) => b.total.comparedTo(a.total)),
  };
}
