import { db } from "@/data/db";
import { D, HUNDRED, ZERO, money, pct, qty } from "@/lib/money";
import { brl, num } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/defaults";
import { computePrice } from "./costing";
import { getSettings } from "./settings";
import type Decimal from "decimal.js";

export type Insight = {
  id: string;
  level: "danger" | "warning" | "success" | "info";
  icon: string;
  title: string;
  detail: string;
  action?: { label: string; href: string };
  weight: number;
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const unit = (u: string) => UNIT_LABELS[u] ?? u.toLowerCase();

/**
 * CENTRAL DE DECISÕES
 * Todas as recomendações saem dos dados reais gravados no aparelho.
 */
export async function getInsights(): Promise<Insight[]> {
  const settings = await getSettings();
  const coverageDays = Number(settings.productionCoverageDays || 15);
  const purchaseCoverage = Number(settings.purchaseCoverageDays || 20);
  const inactiveDays = Number(settings.inactiveCustomerDays || 30);

  const [products, sales, movements, customers, productions] = await Promise.all([
    db.products.toArray(),
    db.sales.toArray(),
    db.movements.toArray(),
    db.customers.toArray(),
    db.productions.toArray(),
  ]);

  const active = products.filter((p) => !p.deletedAt && p.active);
  const byId = new Map(products.map((p) => [p.id, p]));
  const insights: Insight[] = [];

  const last30 = daysAgo(30);
  const last60 = daysAgo(60);
  const done = sales.filter((s) => s.status === "COMPLETED");

  // Vendas por produto: últimos 30 dias e os 30 anteriores
  const soldQty = new Map<string, Decimal>();
  const soldValue = new Map<string, Decimal>();
  const soldCost = new Map<string, Decimal>();
  const previousValue = new Map<string, Decimal>();

  for (const sale of done) {
    const recent = sale.soldAt >= last30;
    const previous = sale.soldAt >= last60 && sale.soldAt < last30;
    if (!recent && !previous) continue;
    for (const item of sale.items) {
      if (recent) {
        soldQty.set(item.productId, (soldQty.get(item.productId) ?? ZERO).plus(D(item.quantity)));
        soldValue.set(item.productId, (soldValue.get(item.productId) ?? ZERO).plus(D(item.total)));
        soldCost.set(item.productId, (soldCost.get(item.productId) ?? ZERO).plus(D(item.totalCost)));
      } else {
        previousValue.set(
          item.productId, (previousValue.get(item.productId) ?? ZERO).plus(D(item.total)),
        );
      }
    }
  }

  // 1) Produto acabado abaixo do mínimo → quanto produzir
  for (const product of active.filter((p) => p.kind === "FINISHED")) {
    const stock = D(product.quantity);
    const min = D(product.minStock);
    if (min.lessThanOrEqualTo(0) || stock.greaterThanOrEqualTo(min)) continue;

    const daily = (soldQty.get(product.id) ?? ZERO).dividedBy(30);
    const coverage = daily.greaterThan(0) ? qty(daily.times(coverageDays)) : min;
    const target = product.maxStock
      ? D(product.maxStock)
      : (min.times(2).greaterThan(coverage) ? min.times(2) : coverage);
    const gap = target.minus(stock);
    const minGap = min.minus(stock);
    const suggestion = qty(gap.greaterThan(minGap) ? gap : minGap);

    insights.push({
      id: `prod-${product.id}`,
      level: stock.lessThanOrEqualTo(0) ? "danger" : "warning",
      icon: "🏭",
      title: `Recomenda-se produzir ${num(suggestion, 0)} ${unit(product.unit)} de ${product.name}`,
      detail:
        `Estoque atual ${num(stock, 1)} ${unit(product.unit)} contra mínimo de ` +
        `${num(min, 1)} ${unit(product.unit)}.` +
        (daily.greaterThan(0)
          ? ` Venda média de ${num(daily, 2)} ${unit(product.unit)}/dia nos últimos 30 dias — ` +
            `cobertura alvo de ${coverageDays} dias.`
          : " Sem vendas nos últimos 30 dias; sugestão baseada no estoque mínimo."),
      action: { label: "Registrar produção", href: `/producao/nova?produto=${product.id}&qtd=${suggestion.toFixed(0)}` },
      weight: stock.lessThanOrEqualTo(0) ? 100 : 80,
    });
  }

  // 2) Matéria-prima abaixo do mínimo → quanto comprar
  const consumption = new Map<string, Decimal>();
  for (const movement of movements) {
    if (movement.reason !== "PRODUCTION_OUT" || movement.createdAt < last30) continue;
    consumption.set(
      movement.productId,
      (consumption.get(movement.productId) ?? ZERO).plus(D(movement.quantity)),
    );
  }

  for (const product of active.filter((p) => p.kind === "RAW" || p.kind === "PACKAGING")) {
    const stock = D(product.quantity);
    const min = D(product.minStock);
    if (min.lessThanOrEqualTo(0) || stock.greaterThanOrEqualTo(min)) continue;

    const daily = (consumption.get(product.id) ?? ZERO).dividedBy(30);
    const coverage = daily.greaterThan(0) ? qty(daily.times(purchaseCoverage)) : min;
    const gap = coverage.minus(stock);
    const minGap = min.minus(stock);
    const suggestion = qty(gap.greaterThan(minGap) ? gap : minGap);

    insights.push({
      id: `buy-${product.id}`,
      level: stock.lessThanOrEqualTo(0) ? "danger" : "warning",
      icon: "📦",
      title: `Recomenda-se comprar ${num(suggestion, 0)} ${unit(product.unit)} de ${product.name}`,
      detail:
        `Saldo de ${num(stock, 1)} ${unit(product.unit)} abaixo do mínimo de ` +
        `${num(min, 1)} ${unit(product.unit)}.` +
        (daily.greaterThan(0)
          ? ` Consumo de ${num(daily, 2)} ${unit(product.unit)}/dia na produção.`
          : ""),
      action: { label: "Registrar entrada", href: `/estoque/entrada?produto=${product.id}` },
      weight: stock.lessThanOrEqualTo(0) ? 95 : 75,
    });
  }

  // 3) Variação do preço de compra dos insumos
  const priceWindow = (from: string, to?: string) => {
    const map = new Map<string, { qty: Decimal; value: Decimal }>();
    for (const movement of movements) {
      if (movement.reason !== "PURCHASE") continue;
      if (movement.createdAt < from) continue;
      if (to && movement.createdAt >= to) continue;
      const current = map.get(movement.productId) ?? { qty: ZERO, value: ZERO };
      current.qty = current.qty.plus(D(movement.quantity));
      current.value = current.value.plus(D(movement.totalCost));
      map.set(movement.productId, current);
    }
    return new Map(
      [...map.entries()]
        .filter(([, v]) => v.qty.greaterThan(0))
        .map(([k, v]) => [k, v.value.dividedBy(v.qty)]),
    );
  };

  const recentPrices = priceWindow(last30);
  const oldPrices = priceWindow(daysAgo(120), last30);

  for (const [productId, recent] of recentPrices) {
    const old = oldPrices.get(productId);
    const product = byId.get(productId);
    if (!old || old.lessThanOrEqualTo(0) || !product) continue;
    const variation = pct(recent.minus(old).dividedBy(old).times(HUNDRED));
    if (variation.abs().lessThan(5)) continue;
    const up = variation.greaterThan(0);

    insights.push({
      id: `price-${productId}`,
      level: up ? "warning" : "success",
      icon: up ? "⚠️" : "💚",
      title: `${product.name} ${up ? "aumentou" : "reduziu"} ${num(variation.abs(), 1)}% no último mês`,
      detail:
        `Preço médio de compra passou de ${brl(old)} para ${brl(recent)} por ${unit(product.unit)}. ` +
        (up
          ? "Revise a formação de preço dos produtos que usam este insumo."
          : "Boa oportunidade para reforçar o estoque."),
      action: { label: "Ver formação de preço", href: "/precificacao" },
      weight: up ? 70 : 40,
    });
  }

  // 4) Crescimento e queda de vendas
  for (const [productId, recent] of soldValue) {
    const product = byId.get(productId);
    if (!product) continue;
    const old = previousValue.get(productId) ?? ZERO;

    if (old.lessThanOrEqualTo(0)) {
      if (recent.greaterThan(0)) {
        insights.push({
          id: `new-${productId}`, level: "success", icon: "📈",
          title: `${product.name} começou a vender neste período`,
          detail: `${brl(recent)} nos últimos 30 dias, sem vendas nos 30 anteriores.`,
          weight: 45,
        });
      }
      continue;
    }

    const variation = pct(recent.minus(old).dividedBy(old).times(HUNDRED));
    if (variation.abs().lessThan(15)) continue;
    const growing = variation.greaterThan(0);
    insights.push({
      id: `trend-${productId}`,
      level: growing ? "success" : "warning",
      icon: growing ? "📈" : "📉",
      title: `${product.name} teve ${growing ? "crescimento" : "queda"} de ${num(variation.abs(), 0)}% nas vendas`,
      detail: `${brl(old)} → ${brl(recent)} comparando os últimos 30 dias com os 30 anteriores.`,
      weight: growing ? 55 : 65,
    });
  }

  // 5) Margem: melhor e pior
  const margins = [...soldValue.entries()]
    .map(([productId, revenue]) => {
      const product = byId.get(productId);
      const cost = soldCost.get(productId) ?? ZERO;
      if (!product || revenue.lessThanOrEqualTo(0)) return null;
      return { product, revenue, marginPct: pct(revenue.minus(cost).dividedBy(revenue).times(HUNDRED)) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.marginPct.comparedTo(a.marginPct));

  if (margins.length >= 2) {
    const best = margins[0];
    const worst = margins[margins.length - 1];
    insights.push({
      id: "margin-best", level: "success", icon: "💰",
      title: `${best.product.name} tem a maior margem: ${num(best.marginPct, 1)}%`,
      detail: `Faturou ${brl(best.revenue)} nos últimos 30 dias. Vale priorizar produção e divulgação deste item.`,
      action: { label: "Ver produtos", href: "/produtos" },
      weight: 50,
    });
    if (worst.marginPct.lessThan(15)) {
      insights.push({
        id: "margin-worst", level: "warning", icon: "🔻",
        title: `${worst.product.name} está com margem baixa: ${num(worst.marginPct, 1)}%`,
        detail: "Revise o preço de venda, o custo da ficha técnica ou os descontos concedidos.",
        action: { label: "Recalcular preço", href: `/precificacao?produto=${worst.product.id}` },
        weight: 72,
      });
    }
  }

  // 6) Preço abaixo do mínimo
  for (const product of active.filter((p) => p.kind === "FINISHED" && D(p.salePrice).greaterThan(0))) {
    if (D(product.avgCost).lessThanOrEqualTo(0)) continue;
    const pricing = computePrice({
      unitCost: D(product.avgCost),
      taxPct: settings.taxPct,
      fixedOverheadPct: settings.fixedOverheadPct,
      commissionPct: settings.commissionPct,
      cardFeePct: settings.cardFeePct,
      targetMarginPct: D(product.targetMargin).greaterThan(0)
        ? D(product.targetMargin)
        : settings.defaultTargetMarginPct,
      currentPrice: D(product.salePrice),
    });
    if (!pricing.belowMinimum) continue;

    insights.push({
      id: `underprice-${product.id}`, level: "danger", icon: "🚨",
      title: `${product.name} está sendo vendido abaixo do preço mínimo`,
      detail:
        `Preço atual ${brl(product.salePrice)} contra mínimo de ${brl(pricing.minimumPrice)} ` +
        `(custo ${brl(product.avgCost)} + impostos e despesas).`,
      action: { label: "Corrigir preço", href: `/precificacao?produto=${product.id}` },
      weight: 90,
    });
  }

  // 7) Clientes que pararam de comprar
  const lastPurchase = new Map<string, { at: string; total: Decimal }>();
  for (const sale of done) {
    if (!sale.customerId) continue;
    const current = lastPurchase.get(sale.customerId);
    if (!current || sale.soldAt > current.at) {
      lastPurchase.set(sale.customerId, { at: sale.soldAt, total: D(sale.total) });
    }
  }
  for (const customer of customers.filter((c) => c.active && !c.deletedAt)) {
    const last = lastPurchase.get(customer.id);
    if (!last) continue;
    const days = Math.floor((Date.now() - new Date(last.at).getTime()) / 86400000);
    if (days < inactiveDays) continue;
    insights.push({
      id: `inactive-${customer.id}`, level: "warning", icon: "👤",
      title: `${customer.name} não compra há ${days} dias`,
      detail:
        `Última compra em ${new Date(last.at).toLocaleDateString("pt-BR")} no valor de ` +
        `${brl(last.total)}.${customer.whatsapp ? ` WhatsApp: ${customer.whatsapp}` : ""}`,
      action: { label: "Ver cliente", href: `/clientes/${customer.id}` },
      weight: 60,
    });
  }

  // 8) Estoque parado
  const moved = new Set(movements.filter((m) => m.createdAt >= last60).map((m) => m.productId));
  for (const product of active) {
    const stock = D(product.quantity);
    if (stock.lessThanOrEqualTo(0) || moved.has(product.id)) continue;
    insights.push({
      id: `idle-${product.id}`, level: "info", icon: "🕰️",
      title: `${product.name} está parado há mais de 60 dias`,
      detail:
        `${num(stock, 1)} ${unit(product.unit)} em estoque, valor imobilizado de ` +
        `${brl(money(stock.times(D(product.avgCost))))}.`,
      action: { label: "Ver estoque", href: "/estoque" },
      weight: 35,
    });
  }

  // 9) Rendimento de produção fora do padrão
  const byProduct = new Map<string, { name: string; yields: Decimal[] }>();
  for (const production of productions
    .filter((p) => p.status === "FINISHED" && p.actualYieldPct && p.finishedAt && p.finishedAt >= daysAgo(90))
    .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))) {
    const product = byId.get(production.productId);
    if (!product) continue;
    const current = byProduct.get(production.productId) ?? { name: product.name, yields: [] };
    current.yields.push(D(production.actualYieldPct));
    byProduct.set(production.productId, current);
  }
  for (const [productId, data] of byProduct) {
    if (data.yields.length < 3) continue;
    const avg = data.yields.reduce((a, y) => a.plus(y), ZERO).dividedBy(data.yields.length);
    const last = data.yields[0];
    if (last.greaterThanOrEqualTo(avg.times(0.9))) continue;
    insights.push({
      id: `yield-${productId}`, level: "warning", icon: "⚗️",
      title: `Rendimento de ${data.name} caiu para ${num(last, 1)}%`,
      detail:
        `A média das últimas ${data.yields.length} produções é ${num(avg, 1)}%. ` +
        "Verifique a qualidade da matéria-prima e o processo.",
      action: { label: "Ver produções", href: "/producao" },
      weight: 68,
    });
  }

  return insights.sort((a, b) => b.weight - a.weight);
}
