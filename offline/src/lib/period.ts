/** Filtro de período usado em todas as telas de resultado e relatório. */

export type PeriodKey =
  | "today" | "7d" | "30d" | "thisMonth" | "lastMonth" | "90d" | "thisYear" | "custom";

export type Period = { key: PeriodKey; from: Date; to: Date; label: string };

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "thisMonth", label: "Este mês" },
  { key: "lastMonth", label: "Mês passado" },
  { key: "90d", label: "90 dias" },
  { key: "thisYear", label: "Este ano" },
  { key: "custom", label: "Escolher" },
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export function resolvePeriod(
  key: PeriodKey,
  customFrom?: string,
  customTo?: string,
  reference = new Date(),
): Period {
  const today = startOfDay(reference);
  let from = today;
  let to = endOfDay(reference);

  switch (key) {
    case "today":
      break;
    case "7d":
      from = startOfDay(new Date(today.getTime() - 6 * 86400000));
      break;
    case "30d":
      from = startOfDay(new Date(today.getTime() - 29 * 86400000));
      break;
    case "90d":
      from = startOfDay(new Date(today.getTime() - 89 * 86400000));
      break;
    case "thisMonth":
      from = new Date(reference.getFullYear(), reference.getMonth(), 1);
      break;
    case "lastMonth":
      from = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
      to = endOfDay(new Date(reference.getFullYear(), reference.getMonth(), 0));
      break;
    case "thisYear":
      from = new Date(reference.getFullYear(), 0, 1);
      break;
    case "custom":
      if (customFrom) from = startOfDay(new Date(`${customFrom}T12:00:00`));
      if (customTo) to = endOfDay(new Date(`${customTo}T12:00:00`));
      break;
  }

  return { key, from, to, label: periodLabel(key, from, to) };
}

function periodLabel(key: PeriodKey, from: Date, to: Date): string {
  if (key === "today") return `Hoje (${fmt.format(from)})`;
  const preset = PERIOD_OPTIONS.find((o) => o.key === key);
  const range = `${fmt.format(from)} a ${fmt.format(to)}`;
  return key === "custom" ? range : `${preset?.label ?? ""} — ${range}`;
}

/** Comparação direta com os campos ISO guardados no banco. */
export function inPeriod(iso: string | null | undefined, period: Period): boolean {
  if (!iso) return false;
  return iso >= period.from.toISOString() && iso <= period.to.toISOString();
}

export const DEFAULT_PERIOD: PeriodKey = "30d";
