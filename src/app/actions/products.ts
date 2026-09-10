"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { money, qty, pct } from "@/lib/money";
import { type ActionState, bool, optional, str, toActionError } from "./_helpers";
import type { ProductKind, UnitOfMeasure } from "@prisma/client";

export async function saveProductAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = "";
  try {
    const id = str(form, "id");
    const user = await requirePermission(id ? "products.update" : "products.create");

    const name = str(form, "name");
    if (!name) return { error: "Informe o nome do produto." };
    const kind = (str(form, "kind") || "FINISHED") as ProductKind;
    const sku = str(form, "sku") || (await generateSku(user.companyId, kind));

    const categoryName = str(form, "categoryName");
    let categoryId = optional(form, "categoryId");
    if (!categoryId && categoryName) {
      const category = await prisma.category.upsert({
        where: { companyId_name_kind: { companyId: user.companyId, name: categoryName, kind } },
        update: {},
        create: { companyId: user.companyId, name: categoryName, kind },
      });
      categoryId = category.id;
    }

    const data = {
      name,
      kind,
      sku,
      barcode: optional(form, "barcode"),
      description: optional(form, "description"),
      categoryId,
      unit: (str(form, "unit") || "KG") as UnitOfMeasure,
      netWeightKg: str(form, "netWeightKg") ? qty(str(form, "netWeightKg")) : null,
      salePrice: money(str(form, "salePrice")),
      wholesalePrice: money(str(form, "wholesalePrice")),
      targetMargin: pct(str(form, "targetMargin")),
      minStock: qty(str(form, "minStock")),
      maxStock: str(form, "maxStock") ? qty(str(form, "maxStock")) : null,
      shelfLifeDays: str(form, "shelfLifeDays") ? Number(str(form, "shelfLifeDays")) : null,
      trackBatches: bool(form, "trackBatches"),
      imageUrl: optional(form, "imageUrl"),
      active: bool(form, "active"),
    };

    const product = id
      ? await prisma.product.update({ where: { id }, data })
      : await prisma.product.create({ data: { ...data, companyId: user.companyId } });

    // Extensão de matéria-prima
    if (kind === "RAW") {
      await prisma.rawMaterial.upsert({
        where: { productId: product.id },
        create: {
          productId: product.id,
          purchaseUnit: (str(form, "purchaseUnit") || data.unit) as UnitOfMeasure,
          purchaseFactor: qty(str(form, "purchaseFactor") || "1"),
          standardLossPct: pct(str(form, "standardLossPct")),
          leadTimeDays: Number(str(form, "leadTimeDays") || 0),
          preferredSupplierId: optional(form, "preferredSupplierId"),
        },
        update: {
          purchaseUnit: (str(form, "purchaseUnit") || data.unit) as UnitOfMeasure,
          purchaseFactor: qty(str(form, "purchaseFactor") || "1"),
          standardLossPct: pct(str(form, "standardLossPct")),
          leadTimeDays: Number(str(form, "leadTimeDays") || 0),
          preferredSupplierId: optional(form, "preferredSupplierId"),
        },
      });
    }

    await audit({
      user, action: id ? "UPDATE" : "CREATE", entity: "Product", entityId: product.id,
      summary: `${id ? "Atualizou" : "Cadastrou"} o produto ${product.name} (${product.sku})`,
      after: data,
    });

    revalidatePath("/produtos");
    revalidatePath("/estoque");
    target = `/produtos/${product.id}?ok=1`;
  } catch (error) {
    return toActionError(error);
  }
  redirect(target);
}

async function generateSku(companyId: string, kind: ProductKind) {
  const prefix = { FINISHED: "PA", RAW: "MP", PACKAGING: "EM", RESALE: "RV" }[kind];
  const last = await prisma.product.findFirst({
    where: { companyId, sku: { startsWith: `${prefix}-` } },
    orderBy: { sku: "desc" },
    select: { sku: true },
  });
  const seq = last ? Number(last.sku.split("-")[1]) + 1 : 1;
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}

/** Exclusão lógica: o histórico de estoque e vendas é preservado. */
export async function deleteProductAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("products.delete");
    const id = str(form, "id");
    const product = await prisma.product.findFirstOrThrow({ where: { id, companyId: user.companyId } });
    await prisma.product.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await audit({
      user, action: "DELETE", entity: "Product", entityId: id,
      summary: `Inativou o produto ${product.name} (exclusão lógica)`, before: product,
    });
    revalidatePath("/produtos");
    return { success: `${product.name} foi inativado.` };
  } catch (error) {
    return toActionError(error);
  }
}
