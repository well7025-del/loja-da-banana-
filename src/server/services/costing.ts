import "server-only";
import { Prisma, prisma } from "@/lib/db";
import { D, money, qty, pct, ZERO, marginPct } from "@/lib/money";
import { getSettings } from "./settings";

const ONE = new Prisma.Decimal(1);
const HUNDRED = new Prisma.Decimal(100);

/** Quantidade bruta necessária considerando a perda do ingrediente. */
export function grossQuantity(net: Prisma.Decimal, lossPct: Prisma.Decimal) {
  const factor = ONE.minus(lossPct.dividedBy(HUNDRED));
  if (factor.lessThanOrEqualTo(0)) return qty(net);
  return qty(net.dividedBy(factor));
}

export type RecipeCostLine = {
  productId: string;
  name: string;
  unit: string;
  kind: string;
  netQty: Prisma.Decimal;
  lossPct: Prisma.Decimal;
  grossQty: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  sharePct: Prisma.Decimal;
};

export type RecipeCost = {
  lines: RecipeCostLine[];
  materialCost: Prisma.Decimal;
  packagingCost: Prisma.Decimal;
  laborCost: Prisma.Decimal;
  energyCost: Prisma.Decimal;
  otherCost: Prisma.Decimal;
  overheadCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  /** Rendimento líquido após a perda estimada do processo. */
  netYield: Prisma.Decimal;
  costPerUnit: Prisma.Decimal;
  costPerKg: Prisma.Decimal | null;
};

type RecipeWithItems = Prisma.RecipeGetPayload<{
  include: { items: { include: { product: true } }; product: true };
}>;

/** Calcula o custo completo de uma ficha técnica a partir do custo médio atual. */
export function computeRecipeCost(recipe: RecipeWithItems): RecipeCost {
  const lines: RecipeCostLine[] = [];
  let materialCost = ZERO;
  let packagingCost = ZERO;

  for (const item of recipe.items) {
    const netQty = D(item.quantity);
    const loss = D(item.lossPct);
    const gross = grossQuantity(netQty, loss);
    const unitCost = D(item.product.avgCost);
    const totalCost = money(gross.times(unitCost));
    if (item.product.kind === "PACKAGING") packagingCost = packagingCost.plus(totalCost);
    else materialCost = materialCost.plus(totalCost);
    lines.push({
      productId: item.productId,
      name: item.product.name,
      unit: item.unit,
      kind: item.product.kind,
      netQty,
      lossPct: loss,
      grossQty: gross,
      unitCost,
      totalCost,
      sharePct: ZERO,
    });
  }

  const laborCost = D(recipe.laborCost);
  const energyCost = D(recipe.energyCost);
  const otherCost = D(recipe.otherCost);
  const overheadCost = money(laborCost.plus(energyCost).plus(otherCost));
  const totalCost = money(materialCost.plus(packagingCost).plus(overheadCost));

  for (const line of lines) {
    line.sharePct = totalCost.greaterThan(0)
      ? pct(line.totalCost.dividedBy(totalCost).times(HUNDRED))
      : ZERO;
  }

  const lossFactor = ONE.minus(D(recipe.expectedLossPct).dividedBy(HUNDRED));
  const netYield = qty(
    D(recipe.yieldQty).times(lossFactor.greaterThan(0) ? lossFactor : ONE),
  );
  const costPerUnit = netYield.greaterThan(0) ? qty(totalCost.dividedBy(netYield)) : ZERO;

  let costPerKg: Prisma.Decimal | null = null;
  if (recipe.product.unit === "KG") costPerKg = costPerUnit;
  else if (recipe.product.netWeightKg && D(recipe.product.netWeightKg).greaterThan(0)) {
    costPerKg = qty(costPerUnit.dividedBy(D(recipe.product.netWeightKg)));
  }

  return {
    lines, materialCost: money(materialCost), packagingCost: money(packagingCost),
    laborCost, energyCost, otherCost, overheadCost, totalCost,
    netYield, costPerUnit, costPerKg,
  };
}

export async function getRecipeCost(recipeId: string): Promise<{
  recipe: RecipeWithItems;
  cost: RecipeCost;
} | null> {
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, deletedAt: null },
    include: {
      product: true,
      items: { include: { product: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!recipe) return null;
  return { recipe, cost: computeRecipeCost(recipe) };
}

// ===================== FORMAÇÃO DE PREÇO =====================

export type PricingInput = {
  unitCost: Prisma.Decimal | number | string;
  taxPct?: Prisma.Decimal | number | string;
  fixedOverheadPct?: Prisma.Decimal | number | string;
  commissionPct?: Prisma.Decimal | number | string;
  cardFeePct?: Prisma.Decimal | number | string;
  targetMarginPct?: Prisma.Decimal | number | string;
  currentPrice?: Prisma.Decimal | number | string;
};

export type PricingResult = {
  unitCost: Prisma.Decimal;
  /** Soma dos percentuais que incidem sobre o preço de venda. */
  chargesPct: Prisma.Decimal;
  /** Preço que cobre custo + encargos, com margem zero. */
  minimumPrice: Prisma.Decimal;
  recommendedPrice: Prisma.Decimal;
  currentPrice: Prisma.Decimal | null;
  chargesValue: Prisma.Decimal;
  marginValue: Prisma.Decimal;
  marginPct: Prisma.Decimal;
  markupFactor: Prisma.Decimal;
  currentMarginValue: Prisma.Decimal | null;
  currentMarginPct: Prisma.Decimal | null;
  belowMinimum: boolean;
};

/**
 * Método do divisor (markup): PV = custo / (1 - encargos% - margem%).
 * Garante que a margem informada seja realmente margem sobre a receita.
 */
export function computePrice(input: PricingInput): PricingResult {
  const unitCost = qty(input.unitCost);
  const charges = D(input.taxPct)
    .plus(D(input.fixedOverheadPct))
    .plus(D(input.commissionPct))
    .plus(D(input.cardFeePct));
  const margin = D(input.targetMarginPct);

  const divisorMin = ONE.minus(charges.dividedBy(HUNDRED));
  const minimumPrice = divisorMin.greaterThan(0)
    ? money(unitCost.dividedBy(divisorMin))
    : money(unitCost.times(10));

  const divisor = ONE.minus(charges.plus(margin).dividedBy(HUNDRED));
  const recommendedPrice = divisor.greaterThan(0)
    ? money(unitCost.dividedBy(divisor))
    : money(unitCost.times(10));

  const chargesValue = money(recommendedPrice.times(charges).dividedBy(HUNDRED));
  const marginValue = money(recommendedPrice.minus(unitCost).minus(chargesValue));

  const currentPrice = input.currentPrice !== undefined ? money(input.currentPrice) : null;
  let currentMarginValue: Prisma.Decimal | null = null;
  let currentMarginPctValue: Prisma.Decimal | null = null;
  if (currentPrice && currentPrice.greaterThan(0)) {
    const currentCharges = money(currentPrice.times(charges).dividedBy(HUNDRED));
    currentMarginValue = money(currentPrice.minus(unitCost).minus(currentCharges));
    currentMarginPctValue = pct(currentMarginValue.dividedBy(currentPrice).times(HUNDRED));
  }

  return {
    unitCost,
    chargesPct: pct(charges),
    minimumPrice,
    recommendedPrice,
    currentPrice,
    chargesValue,
    marginValue,
    marginPct: recommendedPrice.greaterThan(0)
      ? pct(marginValue.dividedBy(recommendedPrice).times(HUNDRED))
      : ZERO,
    markupFactor: unitCost.greaterThan(0)
      ? qty(recommendedPrice.dividedBy(unitCost))
      : ZERO,
    currentMarginValue,
    currentMarginPct: currentMarginPctValue,
    belowMinimum: currentPrice ? currentPrice.lessThan(minimumPrice) : false,
  };
}

/** Preço calculado com os parâmetros padrão salvos pela empresa. */
export async function computePriceWithDefaults(
  companyId: string,
  input: Omit<PricingInput, "taxPct" | "fixedOverheadPct" | "commissionPct" | "cardFeePct"> &
    Partial<Pick<PricingInput, "taxPct" | "fixedOverheadPct" | "commissionPct" | "cardFeePct">>,
) {
  const settings = await getSettings(companyId);
  return computePrice({
    ...input,
    taxPct: input.taxPct ?? settings.taxPct,
    fixedOverheadPct: input.fixedOverheadPct ?? settings.fixedOverheadPct,
    commissionPct: input.commissionPct ?? settings.commissionPct,
    cardFeePct: input.cardFeePct ?? settings.cardFeePct,
  });
}

/** Margem realizada de um produto com base no custo médio atual. */
export function productMargin(price: Prisma.Decimal | number, cost: Prisma.Decimal | number) {
  return marginPct(price, cost);
}
