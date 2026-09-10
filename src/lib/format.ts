const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const DATE = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const DATETIME = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

type Num = { toString(): string } | number | string | null | undefined;

const n = (v: Num): number => {
  if (v === null || v === undefined) return 0;
  const parsed = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(parsed) ? parsed : 0;
};

export const brl = (v: Num) => BRL.format(n(v));
export const num = (v: Num, digits = 3) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(n(v));
export const int = (v: Num) => NUM.format(Math.round(n(v)));
export const percent = (v: Num, digits = 1) => `${num(v, digits)}%`;
export const date = (v: Date | string | null | undefined) => (v ? DATE.format(new Date(v)) : "—");
export const datetime = (v: Date | string | null | undefined) => (v ? DATETIME.format(new Date(v)) : "—");

/** "há 3 dias" / "em 5 dias" */
export function relativeDays(target: Date | string | null | undefined) {
  if (!target) return "—";
  const diff = Math.round((new Date(target).getTime() - Date.now()) / 86400000);
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  if (diff === -1) return "ontem";
  return diff > 0 ? `em ${diff} dias` : `há ${Math.abs(diff)} dias`;
}

export function daysBetween(a: Date | string, b: Date | string = new Date()) {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}
