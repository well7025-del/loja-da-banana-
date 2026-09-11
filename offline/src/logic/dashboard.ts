import { db } from "@/data/db";
import type { Batch, Product, Production } from "@/data/types";
import { D, ZERO, money, pct } from "@/lib/money";
import { financeSummary, type FinanceSummary } from "./finance";
import { getSettings } from "./settings";
import { isBelowMin } from "./inventory";
import type Decimal from "decimal.js";

export function dayRange(reference = new Date()) {
  const start = new Date(reference); start.setHours(0, 0, 0, 0);
  const end = new Date(reference); end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function monthRange(reference = new Date()) {
  return {
    start: new Date(reference.getFullYear(), reference.getMonth(), 1),
    end: new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

export type Dashboard = {
  salesToday: { total: Decimal; profit: Decimal; count: number };
  salesMonth: { total: Decimal; profit: Decimal; count: number; marginPct: Decimal };
  finance: FinanceSummary;
  productionToday: { qty: Decimal; count: number };
  pendingProduction: Production[];
  criticalStock: Product[];
  finishedQty: Decimal;
  stockValue: Decimal;
  batchesExpiring: (Batch & { product?: Product })[];
  expiryDays: number;
};

export async function getDashboard(): Promise<Dashboard> {
  const now = new Date();
  const today = dayRange(now);
  const month = monthRange(now);
  const settings = await getSettings();
  const expiryDays = Number(settings.expiryAlertDays || 30);
  const expiryLimit = new Date(now.getTime() + expiryDays * 86400000).toISOString();

  const [sales, products, productions, batches, finance] = await Promise.all([
    db.sales.toArray(),
    db.products.toArray(),
    db.productions.toArray(),
    db.batches.toArray(),
    financeSummary(now),
  ]);

  const done = sales.filter((s) => s.status === "COMPLETED");
  const todaySales = done.filter(
    (s) => s.soldAt >= today.start.toISOString() && s.soldAt <= today.end.toISOString(),
  );
  const monthSales = done.filter(
    (s) => s.soldAt >= month.start.toISOString() && s.soldAt <= month.end.toISOString(),
  );

  const sum = (list: typeof done, field: "total" | "grossProfit") =>
    money(list.reduce((a, s) => a.plus(D(s[field])), ZERO));

  const monthTotal = sum(monthSales, "total");
  const monthProfit = sum(monthSales, "grossProfit");

  const active = products.filter((p) => !p.deletedAt && p.active);
  const finishedTodayProductions = productions.filter(
    (p) => p.status === "FINISHED" && p.finishedAt &&
      p.finishedAt >= today.start.toISOString() && p.finishedAt <= today.end.toISOString(),
  );

  const byId = new Map(products.map((p) => [p.id, p]));

  return {
    salesToday: {
      total: sum(todaySales, "total"),
      profit: sum(todaySales, "grossProfit"),
      count: todaySales.length,
    },
    salesMonth: {
      total: monthTotal,
      profit: monthProfit,
      count: monthSales.length,
      marginPct: monthTotal.greaterThan(0)
        ? pct(monthProfit.dividedBy(monthTotal).times(100))
        : ZERO,
    },
    finance,
    productionToday: {
      qty: finishedTodayProductions.reduce((a, p) => a.plus(D(p.producedQty)), ZERO),
      count: finishedTodayProductions.length,
    },
    pendingProduction: productions
      .filter((p) => p.status === "PLANNED" || p.status === "IN_PROGRESS")
      .slice(0, 10),
    criticalStock: active.filter(isBelowMin)
      .sort((a, b) => D(a.quantity).comparedTo(D(b.quantity))),
    finishedQty: active
      .filter((p) => p.kind === "FINISHED")
      .reduce((a, p) => a.plus(D(p.quantity)), ZERO),
    stockValue: money(
      active.reduce((a, p) => a.plus(D(p.quantity).times(D(p.avgCost))), ZERO),
    ),
    batchesExpiring: batches
      .filter((b) => D(b.availableQty).greaterThan(0) && b.expiresAt && b.expiresAt <= expiryLimit)
      .sort((a, b) => (a.expiresAt ?? "").localeCompare(b.expiresAt ?? ""))
      .slice(0, 20)
      .map((b) => ({ ...b, product: byId.get(b.productId) })),
    expiryDays,
  };
}

export type Alert = {
  level: "danger" | "warning" | "info";
  icon: string;
  title: string;
  detail: string;
  href: string;
};

export function buildAlerts(data: Dashboard): Alert[] {
  const alerts: Alert[] = [];

  if (data.criticalStock.length) {
    alerts.push({
      level: "danger", icon: "📦",
      title: `${data.criticalStock.length} item(ns) abaixo do estoque mínimo`,
      detail: data.criticalStock.slice(0, 3).map((p) => p.name).join(", "),
      href: "/estoque?filtro=critico",
    });
  }
  if (data.finance.overduePayableCount > 0) {
    alerts.push({
      level: "danger", icon: "💸",
      title: `${data.finance.overduePayableCount} conta(s) vencida(s) a pagar`,
      detail: `Total de ${data.finance.overduePayable.toFixed(2)}`,
      href: "/financeiro/pagar",
    });
  }
  if (data.finance.overdueReceivableCount > 0) {
    alerts.push({
      level: "warning", icon: "🧾",
      title: `${data.finance.overdueReceivableCount} título(s) vencido(s) a receber`,
      detail: "Clientes com pagamento em atraso",
      href: "/financeiro/receber",
    });
  }
  if (data.batchesExpiring.length) {
    alerts.push({
      level: "warning", icon: "⏳",
      title: `${data.batchesExpiring.length} lote(s) vencendo em ${data.expiryDays} dias`,
      detail: data.batchesExpiring.slice(0, 3)
        .map((b) => `${b.product?.name ?? "?"} (${b.code})`).join(", "),
      href: "/estoque/lotes",
    });
  }
  if (data.pendingProduction.length) {
    alerts.push({
      level: "info", icon: "🏭",
      title: `${data.pendingProduction.length} produção(ões) em andamento`,
      detail: "Toque para finalizar e gerar o lote",
      href: "/producao",
    });
  }
  return alerts;
}
