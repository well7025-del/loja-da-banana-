import "server-only";
import { Prisma, prisma } from "@/lib/db";
import { D, money, qty, pct, ZERO } from "@/lib/money";
import { nextCode } from "@/lib/codes";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { BusinessError, registerEntry, registerExit } from "./inventory";
import { computeRecipeCost, grossQuantity } from "./costing";

const ONE = new Prisma.Decimal(1);
const HUNDRED = new Prisma.Decimal(100);

/** Necessidade de matéria-prima para produzir X unidades do produto. */
export async function explodeRecipe(productId: string, plannedQty: Prisma.Decimal | number | string) {
  const recipe = await prisma.recipe.findFirst({
    where: { productId, deletedAt: null, active: true },
    include: { product: true, items: { include: { product: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!recipe) return null;

  const cost = computeRecipeCost(recipe);
  const target = qty(plannedQty);
  const factor = cost.netYield.greaterThan(0) ? target.dividedBy(cost.netYield) : ONE;

  const requirements = await Promise.all(
    recipe.items.map(async (item) => {
      const gross = qty(grossQuantity(D(item.quantity), D(item.lossPct)).times(factor));
      const balance = await prisma.inventory.aggregate({
        where: { productId: item.productId, companyId: recipe.companyId },
        _sum: { quantity: true },
      });
      const available = D(balance._sum.quantity);
      return {
        productId: item.productId,
        name: item.product.name,
        unit: item.unit,
        kind: item.product.kind,
        isMain: item.isMain,
        requiredQty: gross,
        available,
        missing: available.lessThan(gross) ? qty(gross.minus(available)) : ZERO,
        unitCost: D(item.product.avgCost),
        totalCost: money(gross.times(D(item.product.avgCost))),
      };
    }),
  );

  const overhead = money(
    D(recipe.laborCost).plus(D(recipe.energyCost)).plus(D(recipe.otherCost)).times(factor),
  );
  const materialCost = requirements.reduce((acc, r) => acc.plus(r.totalCost), ZERO);

  return {
    recipe,
    factor,
    requirements,
    materialCost: money(materialCost),
    overheadCost: overhead,
    estimatedCost: money(materialCost.plus(overhead)),
    estimatedUnitCost: target.greaterThan(0) ? qty(materialCost.plus(overhead).dividedBy(target)) : ZERO,
    hasShortage: requirements.some((r) => r.missing.greaterThan(0)),
  };
}

export async function createProductionOrder(
  user: SessionUser,
  input: {
    productId: string;
    plannedQty: string | number;
    warehouseId: string;
    notes?: string;
    startNow?: boolean;
  },
) {
  const plannedQty = qty(input.plannedQty);
  if (plannedQty.lessThanOrEqualTo(0)) {
    throw new BusinessError("Informe a quantidade planejada.");
  }
  const product = await prisma.product.findFirst({
    where: { id: input.productId, companyId: user.companyId, deletedAt: null },
  });
  if (!product) throw new BusinessError("Produto não encontrado.");

  const explosion = await explodeRecipe(input.productId, plannedQty);

  const order = await prisma.$transaction(async (tx) => {
    const code = await nextCode(tx, "production", user.companyId);
    const created = await tx.productionOrder.create({
      data: {
        companyId: user.companyId,
        warehouseId: input.warehouseId,
        code,
        productId: input.productId,
        recipeId: explosion?.recipe.id ?? null,
        status: input.startNow ? "IN_PROGRESS" : "PLANNED",
        startedAt: input.startNow ? new Date() : null,
        plannedQty,
        expectedYieldPct: explosion ? expectedYield(explosion) : null,
        responsibleId: user.id,
        notes: input.notes ?? null,
        consumptions: explosion
          ? {
              create: explosion.requirements.map((r) => ({
                productId: r.productId,
                plannedQty: r.requiredQty,
                actualQty: r.requiredQty,
                unitCost: r.unitCost,
                totalCost: r.totalCost,
              })),
            }
          : undefined,
      },
      include: { consumptions: true, product: true },
    });
    await audit(
      {
        user,
        action: "CREATE",
        entity: "ProductionOrder",
        entityId: created.id,
        summary: `Ordem ${code}: ${plannedQty.toFixed(3)} de ${product.name}`,
        after: { code, plannedQty: plannedQty.toString() },
      },
      tx,
    );
    return created;
  });

  return order;
}

/**
 * Ingrediente principal da receita: o marcado como `isMain` ou, na falta dele,
 * a matéria-prima de maior quantidade na ficha técnica.
 */
async function resolveMainIngredient(
  tx: Prisma.TransactionClient,
  recipeId: string | null,
  consumptions: { productId: string; plannedQty: Prisma.Decimal }[],
): Promise<string | null> {
  if (recipeId) {
    const marked = await tx.recipeItem.findFirst({ where: { recipeId, isMain: true } });
    if (marked) return marked.productId;
  }
  const raws = await tx.product.findMany({
    where: { id: { in: consumptions.map((c) => c.productId) }, kind: "RAW" },
    select: { id: true },
  });
  const rawIds = new Set(raws.map((r) => r.id));
  const candidates = consumptions
    .filter((c) => rawIds.has(c.productId))
    .sort((a, b) => D(b.plannedQty).comparedTo(D(a.plannedQty)));
  return candidates[0]?.productId ?? null;
}

function expectedYield(explosion: NonNullable<Awaited<ReturnType<typeof explodeRecipe>>>) {
  const raws = explosion.requirements.filter((r) => r.kind === "RAW");
  const main =
    raws.find((r) => r.isMain) ??
    [...raws].sort((a, b) => b.requiredQty.comparedTo(a.requiredQty))[0];
  const input = main ? main.requiredQty : ZERO;
  if (input.lessThanOrEqualTo(0)) return null;
  const output = D(explosion.recipe.yieldQty).times(explosion.factor);
  return pct(output.dividedBy(input).times(HUNDRED));
}

export async function startProduction(user: SessionUser, id: string) {
  const order = await prisma.productionOrder.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
  });
  if (!order) throw new BusinessError("Ordem de produção não encontrada.");
  if (order.status !== "PLANNED") throw new BusinessError("Esta ordem já foi iniciada.");

  const updated = await prisma.productionOrder.update({
    where: { id },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
  await audit({ user, action: "UPDATE", entity: "ProductionOrder", entityId: id, summary: `Iniciou ${order.code}` });
  return updated;
}

/**
 * Finaliza a produção:
 * 1. baixa a matéria-prima  2. calcula custo real  3. gera lote
 * 4. dá entrada no produto acabado  5. apura rendimento e perdas
 */
export async function finishProduction(
  user: SessionUser,
  input: {
    id: string;
    producedQty: string | number;
    lossQty?: string | number;
    notes?: string;
    consumptions?: { productId: string; actualQty: string | number }[];
  },
) {
  const producedQty = qty(input.producedQty);
  if (producedQty.lessThanOrEqualTo(0)) {
    throw new BusinessError("Informe a quantidade produzida.");
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findFirst({
      where: { id: input.id, companyId: user.companyId, deletedAt: null },
      include: { consumptions: true, product: true, recipe: true },
    });
    if (!order) throw new BusinessError("Ordem de produção não encontrada.");
    if (order.status === "FINISHED") throw new BusinessError("Esta produção já foi finalizada.");
    if (order.status === "CANCELLED") throw new BusinessError("Esta produção foi cancelada.");

    const overrides = new Map(
      (input.consumptions ?? []).map((c) => [c.productId, qty(c.actualQty)]),
    );

    // O rendimento é medido sobre o ingrediente principal (ex.: banana),
    // não sobre a soma de todos os insumos.
    const mainProductId = await resolveMainIngredient(tx, order.recipeId, order.consumptions);

    // 1. Baixa das matérias-primas pelo custo médio / FEFO
    let materialCost = ZERO;
    let rawInputQty = ZERO;
    for (const consumption of order.consumptions) {
      const actualQty = overrides.get(consumption.productId) ?? D(consumption.plannedQty);
      if (actualQty.lessThanOrEqualTo(0)) {
        await tx.productionConsumption.update({
          where: { id: consumption.id },
          data: { actualQty: ZERO, totalCost: ZERO },
        });
        continue;
      }
      const exit = await registerExit(tx, {
        companyId: user.companyId,
        warehouseId: order.warehouseId,
        productId: consumption.productId,
        quantity: actualQty,
        reason: "PRODUCTION_OUT",
        refType: "ProductionOrder",
        refId: order.id,
        productionOrderId: order.id,
        note: `Consumo na ordem ${order.code}`,
        userId: user.id,
      });
      materialCost = materialCost.plus(exit.totalCost);
      if (consumption.productId === mainProductId) rawInputQty = rawInputQty.plus(actualQty);

      await tx.productionConsumption.update({
        where: { id: consumption.id },
        data: {
          actualQty,
          unitCost: exit.unitCost,
          totalCost: exit.totalCost,
          batchId: exit.movements[0]?.batchId ?? null,
        },
      });
    }

    // 2. Custos indiretos rateados pela proporção produzida
    const factor =
      order.recipe && D(order.recipe.yieldQty).greaterThan(0)
        ? producedQty.dividedBy(D(order.recipe.yieldQty))
        : ONE;
    const overheadCost = order.recipe
      ? money(
          D(order.recipe.laborCost)
            .plus(D(order.recipe.energyCost))
            .plus(D(order.recipe.otherCost))
            .times(factor),
        )
      : ZERO;

    const totalCost = money(materialCost.plus(overheadCost));
    const unitCost = qty(totalCost.dividedBy(producedQty));

    // 3. Lote automático LB-AAAAMMDD-000
    const manufacturedAt = new Date();
    const expiresAt = order.product.shelfLifeDays
      ? new Date(manufacturedAt.getTime() + order.product.shelfLifeDays * 86400000)
      : null;
    const batchCode = await nextCode(tx, "batch", user.companyId, manufacturedAt);
    const batch = await tx.batch.create({
      data: {
        companyId: user.companyId,
        warehouseId: order.warehouseId,
        productId: order.productId,
        code: batchCode,
        origin: "PRODUCTION",
        producedQty,
        availableQty: 0, // a entrada de estoque incrementa
        unitCost,
        manufacturedAt,
        expiresAt,
        productionOrderId: order.id,
      },
    });

    // 4. Entrada do produto acabado (atualiza custo médio)
    await registerEntry(tx, {
      companyId: user.companyId,
      warehouseId: order.warehouseId,
      productId: order.productId,
      quantity: producedQty,
      unitCost,
      reason: "PRODUCTION_IN",
      batchId: batch.id,
      refType: "ProductionOrder",
      refId: order.id,
      productionOrderId: order.id,
      note: `Produção ${order.code} — lote ${batchCode}`,
      userId: user.id,
    });

    // 5. Perdas registradas como movimento de perda (rastreabilidade)
    const lossQty = qty(input.lossQty ?? 0);
    if (lossQty.greaterThan(0)) {
      await tx.inventoryMovement.create({
        data: {
          companyId: user.companyId,
          warehouseId: order.warehouseId,
          productId: order.productId,
          type: "OUT",
          reason: "LOSS",
          quantity: lossQty,
          unitCost,
          totalCost: money(lossQty.times(unitCost)),
          balanceAfter: ZERO,
          refType: "ProductionOrder",
          refId: order.id,
          productionOrderId: order.id,
          note: `Perda apontada na produção ${order.code}`,
          userId: user.id,
        },
      });
    }

    const actualYieldPct = rawInputQty.greaterThan(0)
      ? pct(producedQty.dividedBy(rawInputQty).times(HUNDRED))
      : null;

    const finished = await tx.productionOrder.update({
      where: { id: order.id },
      data: {
        status: "FINISHED",
        producedQty,
        lossQty,
        materialCost: money(materialCost),
        overheadCost,
        totalCost,
        unitCost,
        inputQty: rawInputQty,
        actualYieldPct,
        finishedAt: new Date(),
        notes: input.notes ?? order.notes,
      },
      include: { product: true, batches: true },
    });

    await audit(
      {
        user,
        action: "UPDATE",
        entity: "ProductionOrder",
        entityId: order.id,
        summary: `Finalizou ${order.code}: ${producedQty.toFixed(3)} ${order.product.unit} — lote ${batchCode} — custo ${totalCost.toFixed(2)}`,
        after: {
          producedQty: producedQty.toString(),
          totalCost: totalCost.toString(),
          batch: batchCode,
          actualYieldPct: actualYieldPct?.toString() ?? null,
        },
      },
      tx,
    );

    return { order: finished, batch, unitCost, totalCost, actualYieldPct };
  }, { timeout: 20000 });
}

export async function cancelProduction(user: SessionUser, id: string, reason: string) {
  const order = await prisma.productionOrder.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
  });
  if (!order) throw new BusinessError("Ordem não encontrada.");
  if (order.status === "FINISHED") {
    throw new BusinessError("Produção finalizada não pode ser cancelada (estorne pelo estoque).");
  }
  const updated = await prisma.productionOrder.update({
    where: { id },
    data: { status: "CANCELLED", notes: reason },
  });
  await audit({ user, action: "CANCEL", entity: "ProductionOrder", entityId: id, summary: `Cancelou ${order.code}: ${reason}` });
  return updated;
}

/** Indicadores de rendimento por produto. */
export async function yieldReport(companyId: string, from: Date, to: Date) {
  const orders = await prisma.productionOrder.findMany({
    where: { companyId, status: "FINISHED", finishedAt: { gte: from, lte: to }, deletedAt: null },
    include: { product: true },
    orderBy: { finishedAt: "desc" },
  });

  const byProduct = new Map<string, {
    productId: string; name: string; unit: string; runs: number;
    produced: Prisma.Decimal; input: Prisma.Decimal; loss: Prisma.Decimal;
    cost: Prisma.Decimal; best: Prisma.Decimal | null; worst: Prisma.Decimal | null;
    yields: Prisma.Decimal[];
  }>();

  for (const o of orders) {
    const key = o.productId;
    const entry = byProduct.get(key) ?? {
      productId: key, name: o.product.name, unit: o.product.unit, runs: 0,
      produced: ZERO, input: ZERO, loss: ZERO, cost: ZERO, best: null, worst: null, yields: [],
    };
    entry.runs += 1;
    entry.produced = entry.produced.plus(D(o.producedQty));
    entry.input = entry.input.plus(D(o.inputQty));
    entry.loss = entry.loss.plus(D(o.lossQty));
    entry.cost = entry.cost.plus(D(o.totalCost));
    if (o.actualYieldPct) {
      const y = D(o.actualYieldPct);
      entry.yields.push(y);
      entry.best = entry.best === null || y.greaterThan(entry.best) ? y : entry.best;
      entry.worst = entry.worst === null || y.lessThan(entry.worst) ? y : entry.worst;
    }
    byProduct.set(key, entry);
  }

  return {
    orders,
    summary: [...byProduct.values()].map((e) => ({
      ...e,
      avgYieldPct: e.input.greaterThan(0) ? pct(e.produced.dividedBy(e.input).times(HUNDRED)) : null,
      avgUnitCost: e.produced.greaterThan(0) ? qty(e.cost.dividedBy(e.produced)) : ZERO,
      avgLossPct: e.produced.plus(e.loss).greaterThan(0)
        ? pct(e.loss.dividedBy(e.produced.plus(e.loss)).times(HUNDRED))
        : ZERO,
    })),
  };
}
