import { Prisma } from "@prisma/client";

export type Numeric = Prisma.Decimal | number | string | null | undefined;

/** Converte qualquer valor numérico em Decimal (nunca lança em null/undefined). */
export function D(value: Numeric): Prisma.Decimal {
  if (value === null || value === undefined || value === "") return new Prisma.Decimal(0);
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === "number") return new Prisma.Decimal(Number.isFinite(value) ? value : 0);
  const normalized = String(value).trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  // Aceita tanto "1.234,56" (pt-BR) quanto "1234.56" (ISO)
  const iso = /^-?\d+(\.\d+)?$/.test(String(value).trim()) ? String(value).trim() : normalized;
  const d = new Prisma.Decimal(iso === "" || iso === "-" ? 0 : iso);
  return d.isNaN() ? new Prisma.Decimal(0) : d;
}

/** Arredonda para 2 casas (dinheiro). */
export function money(value: Numeric): Prisma.Decimal {
  return D(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Arredonda para 6 casas (quantidades e custos unitários). */
export function qty(value: Numeric): Prisma.Decimal {
  return D(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}

/** Percentual com 4 casas. */
export function pct(value: Numeric): Prisma.Decimal {
  return D(value).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

export function toNumber(value: Numeric): number {
  return D(value).toNumber();
}

/** Margem % sobre a receita: (preço - custo) / preço * 100. */
export function marginPct(price: Numeric, cost: Numeric): Prisma.Decimal {
  const p = D(price);
  if (p.lessThanOrEqualTo(0)) return new Prisma.Decimal(0);
  return pct(p.minus(D(cost)).dividedBy(p).times(100));
}

/** Markup: preço a partir do custo e da margem desejada sobre o preço. */
export function priceFromMargin(cost: Numeric, marginPercent: Numeric): Prisma.Decimal {
  const m = D(marginPercent);
  if (m.greaterThanOrEqualTo(100)) return money(D(cost).times(100)); // margem inválida
  return money(D(cost).dividedBy(new Prisma.Decimal(1).minus(m.dividedBy(100))));
}

export const ZERO = new Prisma.Decimal(0);
