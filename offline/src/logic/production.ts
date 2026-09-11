import { db, newId, nowIso, registerLog } from "@/data/db";
import type { Consumption, Production } from "@/data/types";
import { D, HUNDRED, ONE, ZERO, money, pct, qty, store } from "@/lib/money";
import { BusinessError, nextCode } from "./codes";
import { computeRecipeCost, grossQuantity } from "./costing";
import { registerEntry, registerExit } from "./inventory";
import type Decimal from "decimal.js";

export type Requirement = {
  productId: string;
  name: string;
  unit: string;
  kind: string;
  isMain: boolean;
  requiredQty: Decimal;
  available: Decimal;
  missing: Decimal;
  unitCost: Decimal;
  totalCost: Decimal;
};

export type Explosion = {
  recipeId: string;
  requirements: Requirement[];
  materialCost: Decimal;
  overheadCost: Decimal;
  estimatedCost: Decimal;
  estimatedUnitCost: Decimal;
  expectedYieldPct: Decimal | null;
  hasShortage: boolean;
};

/** Quanto de cada insumo é preciso para produzir X do produto. */
export async function explodeRecipe(
  productId: string,
  plannedQty: Decimal | number | string,
): Promise<Explosion | null> {
  const recipe = await db.recipes.where("productId").equals(productId).first();
  if (!recipe || recipe.deletedAt) return null;

  const product = await db.products.get(productId);
  if (!product) return null;

  const ingredientIds = recipe.items.map((i) => i.productId);
  const ingredients = new Map(
    (await db.products.bulkGet(ingredientIds))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => [p.id, p]),
  );

  const cost = computeRecipeCost(recipe, product, ingredients);
  const target = qty(plannedQty);
  const factor = cost.netYield.greaterThan(0) ? target.dividedBy(cost.netYield) : ONE;

  const requirements: Requirement[] = recipe.items.map((item) => {
    const ingredient = ingredients.get(item.productId);
    const gross = qty(grossQuantity(D(item.quantity), D(item.lossPct)).times(factor));
    const available = D(ingredient?.quantity);
    const unitCost = D(ingredient?.avgCost);
    return {
      productId: item.productId,
      name: ingredient?.name ?? "(item removido)",
      unit: item.unit,
      kind: ingredient?.kind ?? "RAW",
      isMain: item.isMain,
      requiredQty: gross,
      available,
      missing: available.lessThan(gross) ? qty(gross.minus(available)) : ZERO,
      unitCost,
      totalCost: money(gross.times(unitCost)),
    };
  });

  const materialCost = requirements.reduce((a, r) => a.plus(r.totalCost), ZERO);
  const overheadCost = money(
    D(recipe.laborCost).plus(D(recipe.energyCost)).plus(D(recipe.otherCost)).times(factor),
  );
  const estimatedCost = money(materialCost.plus(overheadCost));

  return {
    recipeId: recipe.id,
    requirements,
    materialCost: money(materialCost),
    overheadCost,
    estimatedCost,
    estimatedUnitCost: target.greaterThan(0) ? qty(estimatedCost.dividedBy(target)) : ZERO,
    expectedYieldPct: expectedYield(requirements, D(recipe.yieldQty).times(factor)),
    hasShortage: requirements.some((r) => r.missing.greaterThan(0)),
  };
}

/** Rendimento previsto, medido sobre o ingrediente principal. */
function expectedYield(requirements: Requirement[], output: Decimal): Decimal | null {
  const raws = requirements.filter((r) => r.kind === "RAW");
  const main = raws.find((r) => r.isMain) ??
    [...raws].sort((a, b) => b.requiredQty.comparedTo(a.requiredQty))[0];
  if (!main || main.requiredQty.lessThanOrEqualTo(0)) return null;
  return pct(output.dividedBy(main.requiredQty).times(HUNDRED));
}

export async function createProduction(input: {
  productId: string;
  plannedQty: string | number;
  notes?: string;
  startNow?: boolean;
}): Promise<Production> {
  const plannedQty = qty(input.plannedQty);
  if (plannedQty.lessThanOrEqualTo(0)) throw new BusinessError("Informe a quantidade planejada.");

  const product = await db.products.get(input.productId);
  if (!product) throw new BusinessError("Produto não encontrado.");

  const explosion = await explodeRecipe(input.productId, plannedQty);

  return db.transaction("rw", [db.productions, db.logs], async () => {
    const code = await nextCode("production");
    const production: Production = {
      id: newId(),
      code,
      productId: input.productId,
      recipeId: explosion?.recipeId ?? null,
      status: input.startNow ? "IN_PROGRESS" : "PLANNED",
      plannedQty: store(plannedQty),
      producedQty: null,
      lossQty: "0",
      materialCost: "0",
      overheadCost: "0",
      totalCost: "0",
      unitCost: "0",
      inputQty: "0",
      expectedYieldPct: explosion?.expectedYieldPct ? store(explosion.expectedYieldPct) : null,
      actualYieldPct: null,
      consumptions: (explosion?.requirements ?? []).map<Consumption>((r) => ({
        productId: r.productId,
        plannedQty: store(r.requiredQty),
        actualQty: store(r.requiredQty),
        unitCost: store(r.unitCost),
        totalCost: store(r.totalCost),
      })),
      batchCode: null,
      startedAt: input.startNow ? nowIso() : null,
      finishedAt: null,
      notes: input.notes ?? null,
      createdAt: nowIso(),
    };
    await db.productions.add(production);
    await registerLog(
      "CREATE", "Produção",
      `Ordem ${code}: ${plannedQty.toFixed(3)} ${product.unit.toLowerCase()} de ${product.name}`,
      production.id,
    );
    return production;
  });
}

export type FinishResult = {
  production: Production;
  batchCode: string;
  unitCost: Decimal;
  totalCost: Decimal;
  actualYieldPct: Decimal | null;
};

/**
 * Finaliza a produção:
 * baixa a matéria-prima, gera o lote, dá entrada no produto acabado e
 * apura custo e rendimento reais.
 */
export async function finishProduction(input: {
  id: string;
  producedQty: string | number;
  lossQty?: string | number;
  notes?: string;
  consumptions?: { productId: string; actualQty: string | number }[];
}): Promise<FinishResult> {
  const producedQty = qty(input.producedQty);
  if (producedQty.lessThanOrEqualTo(0)) throw new BusinessError("Informe a quantidade produzida.");

  return db.transaction(
    "rw",
    [db.productions, db.products, db.batches, db.movements, db.recipes, db.logs],
    async () => {
      const production = await db.productions.get(input.id);
      if (!production) throw new BusinessError("Ordem de produção não encontrada.");
      if (production.status === "FINISHED") throw new BusinessError("Esta produção já foi finalizada.");
      if (production.status === "CANCELLED") throw new BusinessError("Esta produção foi cancelada.");

      const product = await db.products.get(production.productId);
      if (!product) throw new BusinessError("Produto da ordem não encontrado.");

      const recipe = production.recipeId ? await db.recipes.get(production.recipeId) : undefined;
      const overrides = new Map((input.consumptions ?? []).map((c) => [c.productId, qty(c.actualQty)]));

      // O rendimento é medido sobre o ingrediente principal, não sobre a
      // soma de todos os insumos.
      const mainProductId = await resolveMainIngredient(production);

      let materialCost = ZERO;
      let rawInputQty = ZERO;
      const consumptions: Consumption[] = [];

      for (const consumption of production.consumptions) {
        const actualQty = overrides.get(consumption.productId) ?? D(consumption.plannedQty);
        if (actualQty.lessThanOrEqualTo(0)) {
          consumptions.push({ ...consumption, actualQty: "0", totalCost: "0" });
          continue;
        }

        const exit = await registerExit({
          productId: consumption.productId,
          quantity: actualQty,
          reason: "PRODUCTION_OUT",
          refType: "Production",
          refId: production.id,
          note: `Consumo na ordem ${production.code}`,
        });

        materialCost = materialCost.plus(exit.totalCost);
        if (consumption.productId === mainProductId) rawInputQty = rawInputQty.plus(actualQty);

        consumptions.push({
          productId: consumption.productId,
          plannedQty: consumption.plannedQty,
          actualQty: store(actualQty),
          unitCost: store(exit.unitCost),
          totalCost: store(exit.totalCost),
        });
      }

      // Custos indiretos rateados pela proporção efetivamente produzida
      const factor = recipe && D(recipe.yieldQty).greaterThan(0)
        ? producedQty.dividedBy(D(recipe.yieldQty))
        : ONE;
      const overheadCost = recipe
        ? money(
            D(recipe.laborCost).plus(D(recipe.energyCost)).plus(D(recipe.otherCost)).times(factor),
          )
        : ZERO;

      const totalCost = money(materialCost.plus(overheadCost));
      const unitCost = qty(totalCost.dividedBy(producedQty));

      // Lote automático LB-AAAAMMDD-000
      const manufacturedAt = new Date();
      const expiresAt = product.shelfLifeDays
        ? new Date(manufacturedAt.getTime() + product.shelfLifeDays * 86400000).toISOString()
        : null;
      const batchCode = await nextCode("batch", manufacturedAt);
      const batchId = newId();
      await db.batches.add({
        id: batchId,
        productId: product.id,
        code: batchCode,
        origin: "PRODUCTION",
        producedQty: store(producedQty),
        availableQty: "0", // a entrada de estoque logo abaixo incrementa
        unitCost: store(unitCost),
        manufacturedAt: manufacturedAt.toISOString(),
        expiresAt,
        productionId: production.id,
        supplierName: null,
        notes: null,
        createdAt: nowIso(),
      });

      await registerEntry({
        productId: product.id,
        quantity: producedQty,
        unitCost,
        reason: "PRODUCTION_IN",
        batchId,
        refType: "Production",
        refId: production.id,
        note: `Produção ${production.code} — lote ${batchCode}`,
      });

      // Perdas ficam registradas para o relatório de desperdício
      const lossQty = qty(input.lossQty ?? 0);
      if (lossQty.greaterThan(0)) {
        await db.movements.add({
          id: newId(),
          productId: product.id,
          batchId: null,
          type: "OUT",
          reason: "LOSS",
          quantity: store(lossQty),
          unitCost: store(unitCost),
          totalCost: store(money(lossQty.times(unitCost))),
          balanceAfter: store(D((await db.products.get(product.id))!.quantity)),
          refType: "Production",
          refId: production.id,
          note: `Perda apontada na produção ${production.code}`,
          createdAt: nowIso(),
        });
      }

      const actualYieldPct = rawInputQty.greaterThan(0)
        ? pct(producedQty.dividedBy(rawInputQty).times(HUNDRED))
        : null;

      const updated: Production = {
        ...production,
        status: "FINISHED",
        producedQty: store(producedQty),
        lossQty: store(lossQty),
        materialCost: store(money(materialCost)),
        overheadCost: store(overheadCost),
        totalCost: store(totalCost),
        unitCost: store(unitCost),
        inputQty: store(rawInputQty),
        actualYieldPct: actualYieldPct ? store(actualYieldPct) : null,
        consumptions,
        batchCode,
        finishedAt: nowIso(),
        notes: input.notes ?? production.notes,
      };
      await db.productions.put(updated);

      await registerLog(
        "UPDATE", "Produção",
        `Finalizou ${production.code}: ${producedQty.toFixed(3)} ${product.unit.toLowerCase()} — ` +
          `lote ${batchCode} — custo R$ ${totalCost.toFixed(2)}`,
        production.id,
      );

      return { production: updated, batchCode, unitCost, totalCost, actualYieldPct };
    },
  );
}

async function resolveMainIngredient(production: Production): Promise<string | null> {
  if (production.recipeId) {
    const recipe = await db.recipes.get(production.recipeId);
    const marked = recipe?.items.find((i) => i.isMain);
    if (marked) return marked.productId;
  }
  const products = await db.products.bulkGet(production.consumptions.map((c) => c.productId));
  const rawIds = new Set(products.filter((p) => p?.kind === "RAW").map((p) => p!.id));
  const candidates = production.consumptions
    .filter((c) => rawIds.has(c.productId))
    .sort((a, b) => D(b.plannedQty).comparedTo(D(a.plannedQty)));
  return candidates[0]?.productId ?? null;
}

export async function cancelProduction(id: string, reason: string) {
  const production = await db.productions.get(id);
  if (!production) throw new BusinessError("Ordem não encontrada.");
  if (production.status === "FINISHED") {
    throw new BusinessError("Produção finalizada não pode ser cancelada (estorne pelo estoque).");
  }
  await db.productions.update(id, { status: "CANCELLED", notes: reason });
  await registerLog("CANCEL", "Produção", `Cancelou ${production.code}: ${reason}`, id);
}
