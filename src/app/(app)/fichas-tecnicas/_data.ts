import "server-only";
import { prisma } from "@/lib/db";
import { D } from "@/lib/money";
import type { Ingredient } from "./recipe-form";

export async function recipeFormData(companyId: string) {
  const [finished, raws] = await Promise.all([
    prisma.product.findMany({
      where: { companyId, deletedAt: null, kind: { in: ["FINISHED", "RESALE"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true },
    }),
    prisma.product.findMany({
      where: { companyId, deletedAt: null, active: true, kind: { in: ["RAW", "PACKAGING"] } },
      orderBy: { name: "asc" },
    }),
  ]);

  const ingredients: Ingredient[] = raws.map((p) => ({
    id: p.id, sku: p.sku, name: p.name, unit: p.unit, kind: p.kind,
    avgCost: D(p.avgCost).toNumber(),
  }));

  return { products: finished, ingredients };
}
