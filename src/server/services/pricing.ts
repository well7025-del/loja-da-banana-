import "server-only";
import { Prisma, prisma } from "@/lib/db";
import { D, money, pct, ZERO } from "@/lib/money";
import type { CustomerType, SaleChannel } from "@prisma/client";

export type PriceRuleRow = Prisma.PriceRuleGetPayload<object>;

export const loadPriceRules = async (companyId: string) =>
  prisma.priceRule.findMany({
    where: { companyId, active: true },
    orderBy: [{ priority: "desc" }, { minQty: "desc" }, { minValue: "desc" }],
  });

type LineContext = {
  productId: string;
  quantity: Prisma.Decimal;
  customerType?: CustomerType | null;
  channel: SaleChannel;
};

/**
 * Desconto de linha: aplica a MELHOR faixa configurada pelo administrador.
 * Nenhum percentual é fixo no código — tudo vem da tabela price_rules.
 */
export function resolveLineDiscount(rules: PriceRuleRow[], ctx: LineContext) {
  let best = ZERO;
  let applied: PriceRuleRow | null = null;

  for (const rule of rules) {
    if (rule.channel && rule.channel !== ctx.channel) continue;
    if (rule.productId && rule.productId !== ctx.productId) continue;
    if (rule.customerType && rule.customerType !== ctx.customerType) continue;

    if (rule.type === "QTY_DISCOUNT") {
      if (ctx.quantity.greaterThanOrEqualTo(D(rule.minQty))) {
        if (D(rule.discountPct).greaterThan(best)) {
          best = D(rule.discountPct);
          applied = rule;
        }
      }
    } else if (rule.type === "CUSTOMER_TYPE") {
      if (rule.customerType && rule.customerType === ctx.customerType) {
        if (D(rule.discountPct).greaterThan(best)) {
          best = D(rule.discountPct);
          applied = rule;
        }
      }
    }
  }

  return { discountPct: pct(best), rule: applied };
}

/** Desconto adicional pelo valor total do pedido. */
export function resolveOrderDiscount(
  rules: PriceRuleRow[],
  total: Prisma.Decimal,
  channel: SaleChannel,
  customerType?: CustomerType | null,
) {
  let best = ZERO;
  let applied: PriceRuleRow | null = null;
  for (const rule of rules) {
    if (rule.type !== "ORDER_VALUE") continue;
    if (rule.channel && rule.channel !== channel) continue;
    if (rule.customerType && rule.customerType !== customerType) continue;
    if (total.greaterThanOrEqualTo(D(rule.minValue)) && D(rule.discountPct).greaterThan(best)) {
      best = D(rule.discountPct);
      applied = rule;
    }
  }
  return { discountPct: pct(best), rule: applied };
}

/** Preço de tabela conforme o canal de venda. */
export function basePrice(
  product: { salePrice: Prisma.Decimal; wholesalePrice: Prisma.Decimal },
  channel: SaleChannel,
) {
  const wholesale = D(product.wholesalePrice);
  if (channel === "WHOLESALE" && wholesale.greaterThan(0)) return money(wholesale);
  return money(D(product.salePrice));
}
