import type { CustomerType, PriceRule, Product, SaleChannel } from "@/data/types";
import { D, ZERO, money, pct } from "@/lib/money";
import type Decimal from "decimal.js";

export type LineContext = {
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


/**
 * Faixas de desconto cadastradas no próprio produto
 * ("acima de 5 kg, 5%"). Vale a melhor faixa alcançada pela quantidade.
 */
export function productQtyDiscount(product: Product | undefined, quantity: Decimal) {
  let best = ZERO;
  let label: string | null = null;

  for (const tier of product?.qtyDiscounts ?? []) {
    const min = D(tier.minQty);
    const value = D(tier.discountPct);
    if (min.greaterThan(0) && quantity.greaterThanOrEqualTo(min) && value.greaterThan(best)) {
      best = value;
      label = `A partir de ${min.toString()}`;
    }
  }
  return { discountPct: pct(best), label };
}

export type DiscountSource = "produto" | "regra" | "cliente" | null;

/**
 * Desconto automático da linha: o maior entre a faixa do produto, as regras
 * gerais e o desconto padrão do cliente. Nenhum percentual é fixo no código.
 */
export function bestLineDiscount(
  rules: PriceRule[],
  product: Product | undefined,
  ctx: LineContext,
  customerDefaultPct: Decimal,
): { discountPct: Decimal; source: DiscountSource; label: string | null } {
  const fromProduct = productQtyDiscount(product, ctx.quantity);
  const fromRules = resolveLineDiscount(rules, ctx);

  let discountPct = ZERO;
  let source: DiscountSource = null;
  let label: string | null = null;

  const consider = (value: Decimal, nextSource: DiscountSource, nextLabel: string | null) => {
    if (value.greaterThan(discountPct)) {
      discountPct = value;
      source = nextSource;
      label = nextLabel;
    }
  };

  consider(fromProduct.discountPct, "produto", fromProduct.label);
  consider(fromRules.discountPct, "regra", fromRules.rule?.name ?? null);
  consider(pct(customerDefaultPct), "cliente", "Desconto do cliente");

  return { discountPct: pct(discountPct), source, label };
}

/** Comissão cadastrada no produto, em percentual. */
export function commissionPctOf(product: Product | undefined): Decimal {
  return pct(D(product?.commissionPct ?? 0));
}
