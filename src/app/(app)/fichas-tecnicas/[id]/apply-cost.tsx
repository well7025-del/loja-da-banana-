"use client";

import { InlineAction } from "@/components/forms";
import { applyRecipeCostAction } from "@/app/actions/recipes";

export function ApplyCostButton({ recipeId }: { recipeId: string }) {
  return (
    <InlineAction
      action={applyRecipeCostAction}
      fields={{ recipeId }}
      label="Aplicar custo ao produto"
      className="btn-ghost btn-sm"
    />
  );
}
