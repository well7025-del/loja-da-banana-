"use server";

import { requirePermission } from "@/lib/auth";
import { explodeRecipe } from "@/server/services/production";

export type RequirementPreview = {
  requirements: {
    productId: string; name: string; unit: string;
    requiredQty: number; available: number; missing: number; totalCost: number;
  }[];
  estimatedCost: number;
  estimatedUnitCost: number;
  hasShortage: boolean;
};

/** Explosão da ficha técnica para a tela de nova produção. */
export async function previewRequirements(
  productId: string,
  plannedQty: string,
): Promise<RequirementPreview | null> {
  await requirePermission("production.read");
  const explosion = await explodeRecipe(productId, plannedQty.replace(",", "."));
  if (!explosion) return null;
  return {
    requirements: explosion.requirements.map((r) => ({
      productId: r.productId,
      name: r.name,
      unit: r.unit,
      requiredQty: r.requiredQty.toNumber(),
      available: r.available.toNumber(),
      missing: r.missing.toNumber(),
      totalCost: r.totalCost.toNumber(),
    })),
    estimatedCost: explosion.estimatedCost.toNumber(),
    estimatedUnitCost: explosion.estimatedUnitCost.toNumber(),
    hasShortage: explosion.hasShortage,
  };
}
