import "server-only";
import { prisma } from "@/lib/db";
import { cache } from "react";
import { DEFAULT_SETTINGS, SETTING_LABELS, type CompanySettings } from "@/lib/defaults";

export { DEFAULT_SETTINGS, SETTING_LABELS };
export type { CompanySettings };

export const getSettings = cache(async (companyId: string): Promise<CompanySettings> => {
  const rows = await prisma.setting.findMany({ where: { companyId } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...map } as CompanySettings;
});

export async function saveSettings(companyId: string, values: Partial<CompanySettings>) {
  const entries = Object.entries(values).filter(([, v]) => v !== undefined && v !== null);
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { companyId_key: { companyId, key } },
        create: { companyId, key, value: String(value) },
        update: { value: String(value) },
      }),
    ),
  );
}
