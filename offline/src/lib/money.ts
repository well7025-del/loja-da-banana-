import Decimal from "decimal.js";

// 28 dígitos e arredondamento comercial: o mesmo comportamento da versão web.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type Numeric = Decimal | number | string | null | undefined;

/** Converte qualquer entrada em Decimal, aceitando "1.234,56" e "1234.56". */
export function D(value: Numeric): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  if (value instanceof Decimal) return value;
  if (typeof value === "number") return new Decimal(Number.isFinite(value) ? value : 0);

  const raw = String(value).trim();
  const iso = /^-?\d+(\.\d+)?$/.test(raw)
    ? raw
    : raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  try {
    const parsed = new Decimal(iso === "" || iso === "-" ? 0 : iso);
    return parsed.isNaN() ? new Decimal(0) : parsed;
  } catch {
    return new Decimal(0);
  }
}

/** Dinheiro: 2 casas. */
export const money = (v: Numeric) => D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
/** Quantidades e custos unitários: 6 casas. */
export const qty = (v: Numeric) => D(v).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
/** Percentuais: 4 casas. */
export const pct = (v: Numeric) => D(v).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);
export const HUNDRED = new Decimal(100);

/** Texto para gravar no banco, preservando a precisão. */
export const store = (v: Numeric) => D(v).toString();

/** Margem sobre a receita: (preço − custo) ÷ preço × 100. */
export function marginPct(price: Numeric, cost: Numeric): Decimal {
  const p = D(price);
  if (p.lessThanOrEqualTo(0)) return ZERO;
  return pct(p.minus(D(cost)).dividedBy(p).times(HUNDRED));
}

export { Decimal };
