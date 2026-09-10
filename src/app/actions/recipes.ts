"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { money, qty, pct } from "@/lib/money";
import { type ActionState, optional, rows, str, toActionError } from "./_helpers";
import type { UnitOfMeasure } from "@prisma/client";

export async function saveRecipeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = "";
  try {
    const id = str(form, "id");
    const user = await requirePermission(id ? "recipes.update" : "recipes.create");
    const productId = str(form, "productId");
    if (!productId) return { error: "Selecione o produto fabricado." };

    const items = rows(form, "items", ["productId", "quantity", "unit", "lossPct", "isMain", "note"])
      .filter((r) => r.productId && Number(r.quantity.replace(",", ".")) > 0);
    if (!items.length) return { error: "Adicione ao menos um ingrediente à ficha técnica." };

    const yieldQty = qty(str(form, "yieldQty"));
    if (yieldQty.lessThanOrEqualTo(0)) return { error: "Informe o rendimento esperado da receita." };

    const data = {
      name: str(form, "name") || "Ficha técnica",
      yieldQty,
      expectedLossPct: pct(str(form, "expectedLossPct")),
      laborCost: money(str(form, "laborCost")),
      energyCost: money(str(form, "energyCost")),
      otherCost: money(str(form, "otherCost")),
      notes: optional(form, "notes"),
    };

    const recipe = await prisma.$transaction(async (tx) => {
      const saved = id
        ? await tx.recipe.update({ where: { id }, data })
        : await tx.recipe.create({ data: { ...data, companyId: user.companyId, productId } });

      await tx.recipeItem.deleteMany({ where: { recipeId: saved.id } });
      await tx.recipeItem.createMany({
        data: items.map((item, index) => ({
          recipeId: saved.id,
          productId: item.productId,
          quantity: qty(item.quantity),
          unit: (item.unit || "KG") as UnitOfMeasure,
          lossPct: pct(item.lossPct),
          isMain: item.isMain === "true" || item.isMain === "on",
          note: item.note || null,
          sortOrder: index,
        })),
      });
      await audit({
        user, action: id ? "UPDATE" : "CREATE", entity: "Recipe", entityId: saved.id,
        summary: `${id ? "Atualizou" : "Criou"} a ficha técnica de ${saved.name}`,
      }, tx);
      return saved;
    });

    revalidatePath("/fichas-tecnicas");
    target = `/fichas-tecnicas/${recipe.id}?ok=1`;
  } catch (error) {
    return toActionError(error);
  }
  redirect(target);
}

/** Copia o custo calculado da ficha para o cadastro do produto. */
export async function applyRecipeCostAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("products.update");
    const recipeId = str(form, "recipeId");
    const { getRecipeCost } = await import("@/server/services/costing");
    const result = await getRecipeCost(recipeId);
    if (!result) return { error: "Ficha técnica não encontrada." };

    await prisma.product.update({
      where: { id: result.recipe.productId },
      data: { avgCost: result.cost.costPerUnit, lastCost: result.cost.costPerUnit },
    });
    await audit({
      user, action: "UPDATE", entity: "Product", entityId: result.recipe.productId,
      summary: `Aplicou o custo da ficha técnica (R$ ${result.cost.costPerUnit.toFixed(4)}) ao produto`,
    });
    revalidatePath(`/fichas-tecnicas/${recipeId}`);
    return { success: `Custo de R$ ${result.cost.costPerUnit.toFixed(2)} aplicado ao produto.` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteRecipeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("recipes.delete");
    const id = str(form, "id");
    await prisma.recipe.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await audit({ user, action: "DELETE", entity: "Recipe", entityId: id, summary: "Inativou uma ficha técnica" });
    revalidatePath("/fichas-tecnicas");
    return { success: "Ficha técnica inativada." };
  } catch (error) {
    return toActionError(error);
  }
}
