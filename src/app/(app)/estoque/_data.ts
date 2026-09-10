import "server-only";
import { prisma } from "@/lib/db";
import { D, ZERO } from "@/lib/money";
import type { StockProduct } from "./movement-forms";

export async function stockProducts(companyId: string): Promise<StockProduct[]> {
  const products = await prisma.product.findMany({
    where: { companyId, deletedAt: null, active: true },
    include: { inventory: true },
    orderBy: { name: "asc" },
  });
  return products.map((p) => ({
    id: p.id, sku: p.sku, name: p.name, unit: p.unit,
    trackBatches: p.trackBatches,
    avgCost: D(p.avgCost).toNumber(),
    stock: p.inventory.reduce((a, i) => a.plus(D(i.quantity)), ZERO).toNumber(),
  }));
}
