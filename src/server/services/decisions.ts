import "server-only";
import { Prisma, prisma } from "@/lib/db";
import { D, money, qty, pct, ZERO } from "@/lib/money";
import { brl, num } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/defaults";
import { getSettings } from "./settings";
import { computePriceWithDefaults } from "./costing";

const HUNDRED = new Prisma.Decimal(100);

export type Insight = {
  id: string;
  level: "danger" | "warning" | "success" | "info";
  icon: string;
  title: string;
  detail: string;
  action?: { label: string; href: string };
  /** Ordena a lista: quanto maior, mais no topo. */
  weight: number;
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const unit = (u: string) => UNIT_LABELS[u] ?? u.toLowerCase();

/**
 * CENTRAL DE DECISÕES
 * Analisa os dados reais do ERP e devolve recomendações acionáveis.
 * Nenhum número é inventado: tudo vem de vendas, compras, estoque e produção.
 */
export async function getInsights(companyId: string): Promise<Insight[]> {
  const settings = await getSettings(companyId);
  const coverageDays = Number(settings.productionCoverageDays || 15);
  const purchaseCoverage = Number(settings.purchaseCoverageDays || 20);
  const inactiveDays = Number(settings.inactiveCustomerDays || 30);

  const [products, salesRecent, salesPrevious, purchasesRecent, purchasesPrevious, customers, movements] =
    await Promise.all([
      prisma.product.findMany({
        where: { companyId, deletedAt: null, active: true },
        include: { inventory: true, recipe: { select: { id: true } } },
      }),
      prisma.saleItem.findMany({
        where: { sale: { companyId, status: "COMPLETED", soldAt: { gte: daysAgo(30) } } },
        select: { productId: true, quantity: true, total: true, totalCost: true },
      }),
      prisma.saleItem.findMany({
        where: { sale: { companyId, status: "COMPLETED", soldAt: { gte: daysAgo(60), lt: daysAgo(30) } } },
        select: { productId: true, quantity: true, total: true },
      }),
      prisma.purchaseItem.findMany({
        where: { purchaseOrder: { companyId, deletedAt: null, orderedAt: { gte: daysAgo(30) } } },
        select: { productId: true, quantity: true, unitPrice: true },
      }),
      prisma.purchaseItem.findMany({
        where: { purchaseOrder: { companyId, deletedAt: null, orderedAt: { gte: daysAgo(90), lt: daysAgo(30) } } },
        select: { productId: true, quantity: true, unitPrice: true },
      }),
      prisma.customer.findMany({
        where: { companyId, deletedAt: null, active: true },
        include: { sales: { where: { status: "COMPLETED" }, orderBy: { soldAt: "desc" }, take: 1, select: { soldAt: true, total: true } } },
      }),
      prisma.inventoryMovement.groupBy({
        by: ["productId"],
        where: { companyId, createdAt: { gte: daysAgo(60) } },
        _count: true,
      }),
    ]);

  const insights: Insight[] = [];
  const stockOf = (p: (typeof products)[number]) =>
    p.inventory.reduce((a, i) => a.plus(D(i.quantity)), ZERO);

  // --- Consumo/venda média diária por produto (últimos 30 dias) ---
  const soldQty = new Map<string, Prisma.Decimal>();
  const soldValue = new Map<string, Prisma.Decimal>();
  const soldCost = new Map<string, Prisma.Decimal>();
  for (const item of salesRecent) {
    soldQty.set(item.productId, (soldQty.get(item.productId) ?? ZERO).plus(D(item.quantity)));
    soldValue.set(item.productId, (soldValue.get(item.productId) ?? ZERO).plus(D(item.total)));
    soldCost.set(item.productId, (soldCost.get(item.productId) ?? ZERO).plus(D(item.totalCost)));
  }
  const previousValue = new Map<string, Prisma.Decimal>();
  for (const item of salesPrevious) {
    previousValue.set(item.productId, (previousValue.get(item.productId) ?? ZERO).plus(D(item.total)));
  }

  // 1) Estoque de produto acabado abaixo do mínimo → sugerir produção
  for (const p of products.filter((x) => x.kind === "FINISHED")) {
    const stock = stockOf(p);
    const min = D(p.minStock);
    if (min.lessThanOrEqualTo(0) || stock.greaterThanOrEqualTo(min)) continue;

    const dailySales = (soldQty.get(p.id) ?? ZERO).dividedBy(30);
    const coverage = dailySales.greaterThan(0) ? qty(dailySales.times(coverageDays)) : min;
    const target = p.maxStock ? D(p.maxStock) : Prisma.Decimal.max(min.times(2), coverage);
    const suggestion = qty(Prisma.Decimal.max(target.minus(stock), min.minus(stock)));

    insights.push({
      id: `prod-${p.id}`,
      level: stock.lessThanOrEqualTo(0) ? "danger" : "warning",
      icon: "🏭",
      title: `Recomenda-se produzir ${num(suggestion, 0)} ${unit(p.unit)} de ${p.name}`,
      detail:
        `Estoque atual ${num(stock, 1)} ${unit(p.unit)} contra mínimo de ${num(min, 1)} ${unit(p.unit)}.` +
        (dailySales.greaterThan(0)
          ? ` Venda média de ${num(dailySales, 2)} ${unit(p.unit)}/dia nos últimos 30 dias — cobertura alvo de ${coverageDays} dias.`
          : " Sem histórico de vendas nos últimos 30 dias; sugestão baseada no estoque mínimo."),
      action: p.recipe
        ? { label: "Registrar produção", href: `/producao/nova?produto=${p.id}&qtd=${suggestion.toFixed(0)}` }
        : { label: "Criar ficha técnica", href: `/fichas-tecnicas/nova?produto=${p.id}` },
      weight: stock.lessThanOrEqualTo(0) ? 100 : 80,
    });
  }

  // 2) Matéria-prima abaixo do mínimo → sugerir compra
  const consumption = await prisma.inventoryMovement.groupBy({
    by: ["productId"],
    where: { companyId, reason: "PRODUCTION_OUT", createdAt: { gte: daysAgo(30) } },
    _sum: { quantity: true },
  });
  const consumptionMap = new Map(consumption.map((c) => [c.productId, D(c._sum.quantity)]));

  for (const p of products.filter((x) => x.kind === "RAW" || x.kind === "PACKAGING")) {
    const stock = stockOf(p);
    const min = D(p.minStock);
    if (min.lessThanOrEqualTo(0) || stock.greaterThanOrEqualTo(min)) continue;
    const daily = (consumptionMap.get(p.id) ?? ZERO).dividedBy(30);
    const coverage = daily.greaterThan(0) ? qty(daily.times(purchaseCoverage)) : min;
    const suggestion = qty(Prisma.Decimal.max(coverage.minus(stock), min.minus(stock)));

    insights.push({
      id: `buy-${p.id}`,
      level: stock.lessThanOrEqualTo(0) ? "danger" : "warning",
      icon: "📦",
      title: `Recomenda-se comprar ${num(suggestion, 0)} ${unit(p.unit)} de ${p.name}`,
      detail:
        `Saldo de ${num(stock, 1)} ${unit(p.unit)} abaixo do mínimo de ${num(min, 1)} ${unit(p.unit)}.` +
        (daily.greaterThan(0) ? ` Consumo de ${num(daily, 2)} ${unit(p.unit)}/dia na produção.` : ""),
      action: { label: "Registrar compra", href: `/compras/nova?produto=${p.id}&qtd=${suggestion.toFixed(0)}` },
      weight: stock.lessThanOrEqualTo(0) ? 95 : 75,
    });
  }

  // 3) Variação do preço de compra dos insumos
  const avgPrice = (rows: { productId: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal }[]) => {
    const map = new Map<string, { qty: Prisma.Decimal; value: Prisma.Decimal }>();
    for (const r of rows) {
      const cur = map.get(r.productId) ?? { qty: ZERO, value: ZERO };
      cur.qty = cur.qty.plus(D(r.quantity));
      cur.value = cur.value.plus(D(r.quantity).times(D(r.unitPrice)));
      map.set(r.productId, cur);
    }
    return new Map(
      [...map.entries()]
        .filter(([, v]) => v.qty.greaterThan(0))
        .map(([k, v]) => [k, v.value.dividedBy(v.qty)]),
    );
  };
  const recentPrices = avgPrice(purchasesRecent);
  const oldPrices = avgPrice(purchasesPrevious);
  for (const [productId, recent] of recentPrices) {
    const old = oldPrices.get(productId);
    if (!old || old.lessThanOrEqualTo(0)) continue;
    const variation = pct(recent.minus(old).dividedBy(old).times(HUNDRED));
    if (variation.abs().lessThan(5)) continue;
    const product = products.find((p) => p.id === productId);
    if (!product) continue;
    const up = variation.greaterThan(0);
    insights.push({
      id: `price-${productId}`,
      level: up ? "warning" : "success",
      icon: up ? "⚠️" : "💚",
      title: `${product.name} ${up ? "aumentou" : "reduziu"} ${num(variation.abs(), 1)}% no último mês`,
      detail: `Preço médio de compra passou de ${brl(old)} para ${brl(recent)} por ${unit(product.unit)}. ${up ? "Revise a formação de preço dos produtos que usam este insumo." : "Boa oportunidade para reforçar o estoque."}`,
      action: { label: "Ver formação de preço", href: "/precificacao" },
      weight: up ? 70 : 40,
    });
  }

  // 4) Crescimento / queda de vendas por produto
  for (const [productId, recent] of soldValue) {
    const old = previousValue.get(productId) ?? ZERO;
    const product = products.find((p) => p.id === productId);
    if (!product) continue;
    if (old.lessThanOrEqualTo(0)) {
      if (recent.greaterThan(0)) {
        insights.push({
          id: `new-${productId}`, level: "success", icon: "📈",
          title: `${product.name} começou a vender neste período`,
          detail: `${brl(recent)} nos últimos 30 dias, sem vendas nos 30 anteriores.`,
          action: { label: "Ver relatório", href: `/relatorios/vendas-produto` },
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
      action: { label: "Ver relatório", href: "/relatorios/vendas-produto" },
      weight: growing ? 55 : 65,
    });
  }

  // 5) Margem por produto: melhor e pior
  const margins = [...soldValue.entries()]
    .map(([productId, revenue]) => {
      const cost = soldCost.get(productId) ?? ZERO;
      const product = products.find((p) => p.id === productId);
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
      action: { label: "Ver margens", href: "/relatorios/margem" },
      weight: 50,
    });
    if (worst.marginPct.lessThan(15)) {
      insights.push({
        id: "margin-worst", level: "warning", icon: "🔻",
        title: `${worst.product.name} está com margem baixa: ${num(worst.marginPct, 1)}%`,
        detail: `Revise o preço de venda, o custo da ficha técnica ou os descontos concedidos.`,
        action: { label: "Recalcular preço", href: `/precificacao?produto=${worst.product.id}` },
        weight: 72,
      });
    }
  }

  // 6) Preço de venda abaixo do preço mínimo
  for (const p of products.filter((x) => x.kind === "FINISHED" && D(x.salePrice).greaterThan(0))) {
    const pricing = await computePriceWithDefaults(companyId, {
      unitCost: D(p.avgCost),
      targetMarginPct: D(p.targetMargin).greaterThan(0) ? D(p.targetMargin) : settings.defaultTargetMarginPct,
      currentPrice: D(p.salePrice),
    });
    if (pricing.belowMinimum && D(p.avgCost).greaterThan(0)) {
      insights.push({
        id: `underprice-${p.id}`, level: "danger", icon: "🚨",
        title: `${p.name} está sendo vendido abaixo do preço mínimo`,
        detail: `Preço atual ${brl(p.salePrice)} contra mínimo de ${brl(pricing.minimumPrice)} (custo ${brl(p.avgCost)} + impostos e despesas).`,
        action: { label: "Corrigir preço", href: `/precificacao?produto=${p.id}` },
        weight: 90,
      });
    }
  }

  // 7) Clientes inativos
  for (const c of customers) {
    const last = c.sales[0];
    if (!last) continue;
    const days = Math.floor((Date.now() - last.soldAt.getTime()) / 86400000);
    if (days < inactiveDays) continue;
    insights.push({
      id: `inactive-${c.id}`, level: "warning", icon: "👤",
      title: `${c.name} não compra há ${days} dias`,
      detail: `Última compra em ${last.soldAt.toLocaleDateString("pt-BR")} no valor de ${brl(last.total)}.${c.whatsapp ? ` WhatsApp: ${c.whatsapp}` : ""}`,
      action: { label: "Ver cliente", href: `/clientes/${c.id}` },
      weight: 60,
    });
  }

  // 8) Estoque parado
  const movedIds = new Set(movements.map((m) => m.productId));
  for (const p of products) {
    const stock = stockOf(p);
    if (stock.lessThanOrEqualTo(0) || movedIds.has(p.id)) continue;
    insights.push({
      id: `idle-${p.id}`, level: "info", icon: "🕰️",
      title: `${p.name} está parado há mais de 60 dias`,
      detail: `${num(stock, 1)} ${unit(p.unit)} em estoque, valor imobilizado de ${brl(money(stock.times(D(p.avgCost))))}.`,
      action: { label: "Ver estoque", href: "/estoque" },
      weight: 35,
    });
  }

  // 9) Rendimento de produção fora do padrão
  const productions = await prisma.productionOrder.findMany({
    where: { companyId, status: "FINISHED", deletedAt: null, finishedAt: { gte: daysAgo(90) }, actualYieldPct: { not: null } },
    include: { product: true },
    orderBy: { finishedAt: "desc" },
  });
  const byProduct = new Map<string, { name: string; yields: Prisma.Decimal[] }>();
  for (const o of productions) {
    const cur = byProduct.get(o.productId) ?? { name: o.product.name, yields: [] };
    cur.yields.push(D(o.actualYieldPct));
    byProduct.set(o.productId, cur);
  }
  for (const [productId, data] of byProduct) {
    if (data.yields.length < 3) continue;
    const avg = data.yields.reduce((a, y) => a.plus(y), ZERO).dividedBy(data.yields.length);
    const last = data.yields[0];
    if (last.lessThan(avg.times(new Prisma.Decimal(0.9)))) {
      insights.push({
        id: `yield-${productId}`, level: "warning", icon: "⚗️",
        title: `Rendimento de ${data.name} caiu para ${num(last, 1)}%`,
        detail: `A média das últimas ${data.yields.length} produções é ${num(avg, 1)}%. Verifique a qualidade da matéria-prima e o processo.`,
        action: { label: "Ver rendimento", href: "/relatorios/rendimento" },
        weight: 68,
      });
    }
  }

  return insights.sort((a, b) => b.weight - a.weight);
}
