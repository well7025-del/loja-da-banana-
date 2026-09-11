import type { Product, Recipe } from "@/data/types";
import { D, HUNDRED, ONE, ZERO, money, pct, qty } from "@/lib/money";
import type Decimal from "decimal.js";

/** Quantidade bruta necessária considerando a perda do ingrediente. */
export function grossQuantity(net: Decimal, lossPct: Decimal): Decimal {
  const factor = ONE.minus(lossPct.dividedBy(HUNDRED));
  if (factor.lessThanOrEqualTo(0)) return qty(net);
  return qty(net.dividedBy(factor));
}

export type RecipeCostLine = {
  productId: string;
  name: string;
  unit: string;
  kind: string;
  netQty: Decimal;
  lossPct: Decimal;
  grossQty: Decimal;
  unitCost: Decimal;
  totalCost: Decimal;
  sharePct: Decimal;
  isMain: boolean;
};

export type RecipeCost = {
  lines: RecipeCostLine[];
  materialCost: Decimal;
  packagingCost: Decimal;
  laborCost: Decimal;
  energyCost: Decimal;
  otherCost: Decimal;
  overheadCost: Decimal;
  totalCost: Decimal;
  netYield: Decimal;
  costPerUnit: Decimal;
  costPerKg: Decimal | null;
};

/**
 * Custo completo da ficha técnica, a partir do custo médio atual de cada
 * insumo. Sempre que uma compra muda o custo médio, este número muda junto.
 */
export function computeRecipeCost(
  recipe: Recipe,
  product: Product,
  ingredients: Map<string, Product>,
): RecipeCost {
  const lines: RecipeCostLine[] = [];
  let materialCost = ZERO;
  let packagingCost = ZERO;

  for (const item of recipe.items) {
    const ingredient = ingredients.get(item.productId);
    const netQty = D(item.quantity);
    const loss = D(item.lossPct);
    const gross = grossQuantity(netQty, loss);
    const unitCost = D(ingredient?.avgCost);
    const totalCost = money(gross.times(unitCost));

    if (ingredient?.kind === "PACKAGING") packagingCost = packagingCost.plus(totalCost);
    else materialCost = materialCost.plus(totalCost);

    lines.push({
      productId: item.productId,
      name: ingredient?.name ?? "(item removido)",
      unit: item.unit,
      kind: ingredient?.kind ?? "RAW",
      netQty,
      lossPct: loss,
      grossQty: gross,
      unitCost,
      totalCost,
      sharePct: ZERO,
      isMain: item.isMain,
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
  const netYield = qty(D(recipe.yieldQty).times(lossFactor.greaterThan(0) ? lossFactor : ONE));
  const costPerUnit = netYield.greaterThan(0) ? qty(totalCost.dividedBy(netYield)) : ZERO;

  let costPerKg: Decimal | null = null;
  if (product.unit === "KG") costPerKg = costPerUnit;
  else if (product.netWeightKg && D(product.netWeightKg).greaterThan(0)) {
    costPerKg = qty(costPerUnit.dividedBy(D(product.netWeightKg)));
  }

  return {
    lines,
    materialCost: money(materialCost),
    packagingCost: money(packagingCost),
    laborCost, energyCost, otherCost, overheadCost, totalCost,
    netYield, costPerUnit, costPerKg,
  };
}

// ===================== FORMAÇÃO DE PREÇO =====================

export type PricingInput = {
  unitCost: Decimal | number | string;
  taxPct?: Decimal | number | string;
  fixedOverheadPct?: Decimal | number | string;
  commissionPct?: Decimal | number | string;
  cardFeePct?: Decimal | number | string;
  targetMarginPct?: Decimal | number | string;
  currentPrice?: Decimal | number | string;
};

export type PricingResult = {
  unitCost: Decimal;
  chargesPct: Decimal;
  minimumPrice: Decimal;
  recommendedPrice: Decimal;
  currentPrice: Decimal | null;
  chargesValue: Decimal;
  marginValue: Decimal;
  marginPct: Decimal;
  markupFactor: Decimal;
  currentMarginValue: Decimal | null;
  currentMarginPct: Decimal | null;
  belowMinimum: boolean;
};

/**
 * Método do divisor: PV = custo ÷ (1 − encargos% − margem%).
 * Garante que a margem informada seja margem de verdade sobre a receita.
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
  let currentMarginValue: Decimal | null = null;
  let currentMarginPctValue: Decimal | null = null;
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
    markupFactor: unitCost.greaterThan(0) ? qty(recommendedPrice.dividedBy(unitCost)) : ZERO,
    currentMarginValue,
    currentMarginPct: currentMarginPctValue,
    belowMinimum: currentPrice ? currentPrice.lessThan(minimumPrice) : false,
  };
}
