import { db } from "@/data/db";
import { DEFAULT_SETTINGS, type CompanySettings } from "@/lib/defaults";

export { DEFAULT_SETTINGS, SETTING_LABELS } from "@/lib/defaults";
export type { CompanySettings } from "@/lib/defaults";

export async function getSettings(): Promise<CompanySettings> {
  const rows = await db.settings.toArray();
  const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...saved } as CompanySettings;
}

export async function saveSettings(values: Partial<CompanySettings>) {
  const entries = Object.entries(values).filter(([, v]) => v !== undefined && v !== null);
  await db.settings.bulkPut(entries.map(([key, value]) => ({ key, value: String(value) })));
}
