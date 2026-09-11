import type { CustomerType, PriceRule, Product, SaleChannel } from "@/data/types";
import { D, ZERO, money, pct } from "@/lib/money";
import type Decimal from "decimal.js";

type LineContext = {
  productId: string;
  quantity: Decimal;
  customerType?: CustomerType | null;
  channel: SaleChannel;
};

/**
 * Desconto de linha: aplica a melhor faixa cadastrada.
 * Nenhum percentual fica fixo no código — tudo vem das regras.
 */
export function resolveLineDiscount(rules: PriceRule[], ctx: LineContext) {
  let best = ZERO;
  let applied: PriceRule | null = null;

  for (const rule of rules) {
    if (!rule.active) continue;
    if (rule.channel && rule.channel !== ctx.channel) continue;
    if (rule.productId && rule.productId !== ctx.productId) continue;
    if (rule.customerType && rule.customerType !== ctx.customerType) continue;

    if (rule.type === "QTY_DISCOUNT" && ctx.quantity.greaterThanOrEqualTo(D(rule.minQty))) {
      if (D(rule.discountPct).greaterThan(best)) {
        best = D(rule.discountPct);
        applied = rule;
      }
    }
    if (rule.type === "CUSTOMER_TYPE" && rule.customerType && rule.customerType === ctx.customerType) {
      if (D(rule.discountPct).greaterThan(best)) {
        best = D(rule.discountPct);
        applied = rule;
      }
    }
  }

  return { discountPct: pct(best), rule: applied };
}

export function resolveOrderDiscount(
  rules: PriceRule[],
  total: Decimal,
  channel: SaleChannel,
  customerType?: CustomerType | null,
) {
  let best = ZERO;
  let applied: PriceRule | null = null;
  for (const rule of rules) {
    if (!rule.active || rule.type !== "ORDER_VALUE") continue;
    if (rule.channel && rule.channel !== channel) continue;
    if (rule.customerType && rule.customerType !== customerType) continue;
    if (total.greaterThanOrEqualTo(D(rule.minValue)) && D(rule.discountPct).greaterThan(best)) {
      best = D(rule.discountPct);
      applied = rule;
    }
  }
  return { discountPct: pct(best), rule: applied };
}

/** Preço de tabela conforme o canal. */
export function basePrice(product: Product, channel: SaleChannel): Decimal {
  const wholesale = D(product.wholesalePrice);
  if (channel === "WHOLESALE" && wholesale.greaterThan(0)) return money(wholesale);
  return money(D(product.salePrice));
}
