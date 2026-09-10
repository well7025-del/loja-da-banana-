"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { createPurchaseOrder, receivePurchase } from "@/server/services/purchases";
import { type ActionState, bool, optional, rows, str, toActionError } from "./_helpers";

export async function createPurchaseAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = "";
  try {
    const user = await requirePermission("purchases.create");
    const supplierId = str(form, "supplierId");
    if (!supplierId) return { error: "Selecione o fornecedor." };

    const items = rows(form, "items", ["productId", "quantity", "unitPrice", "batchCode", "expiresAt"])
      .filter((r) => r.productId && Number(r.quantity.replace(",", ".")) > 0);
    if (!items.length) return { error: "Adicione ao menos um item à compra." };

    const warehouse = await prisma.warehouse.findFirstOrThrow({
      where: { companyId: user.companyId, isDefault: true },
    });

    const purchase = await createPurchaseOrder(user, {
      supplierId,
      warehouseId: warehouse.id,
      items: items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        batchCode: i.batchCode || undefined,
        expiresAt: i.expiresAt || null,
      })),
      freight: str(form, "freight"),
      discount: str(form, "discount"),
      paymentTerms: optional(form, "paymentTerms") ?? undefined,
      dueDate: optional(form, "dueDate"),
      notes: optional(form, "notes") ?? undefined,
      receiveNow: bool(form, "receiveNow"),
    });

    revalidatePath("/compras");
    revalidatePath("/estoque");
    target = `/compras/${purchase.id}?ok=1`;
  } catch (error) {
    return toActionError(error);
  }
  redirect(target);
}

export async function receivePurchaseAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("purchases.update");
    const purchaseOrderId = str(form, "id");
    const items = rows(form, "items", ["purchaseItemId", "receivedQty", "batchCode", "expiresAt"])
      .filter((r) => r.purchaseItemId && Number(r.receivedQty.replace(",", ".")) > 0);
    if (!items.length) return { error: "Informe as quantidades recebidas." };

    const warehouse = await prisma.warehouse.findFirstOrThrow({
      where: { companyId: user.companyId, isDefault: true },
    });
    await receivePurchase(user, {
      purchaseOrderId,
      warehouseId: warehouse.id,
      items: items.map((i) => ({
        purchaseItemId: i.purchaseItemId,
        receivedQty: i.receivedQty,
        batchCode: i.batchCode || undefined,
        expiresAt: i.expiresAt || undefined,
      })),
    });
    revalidatePath("/compras");
    revalidatePath("/estoque");
    return { success: "Mercadoria recebida, estoque atualizado e conta a pagar gerada." };
  } catch (error) {
    return toActionError(error);
  }
}
