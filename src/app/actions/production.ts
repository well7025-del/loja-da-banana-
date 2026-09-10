"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { cancelProduction, createProductionOrder, finishProduction, startProduction } from "@/server/services/production";
import { type ActionState, bool, optional, rows, str, toActionError } from "./_helpers";

export async function createProductionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = "";
  try {
    const user = await requirePermission("production.create");
    const warehouse = await prisma.warehouse.findFirstOrThrow({
      where: { companyId: user.companyId, isDefault: true },
    });
    const order = await createProductionOrder(user, {
      productId: str(form, "productId"),
      plannedQty: str(form, "plannedQty"),
      warehouseId: warehouse.id,
      notes: optional(form, "notes") ?? undefined,
      startNow: bool(form, "startNow"),
    });
    revalidatePath("/producao");
    target = `/producao/${order.id}`;
  } catch (error) {
    return toActionError(error);
  }
  redirect(target);
}

export async function startProductionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("production.update");
    await startProduction(user, str(form, "id"));
    revalidatePath("/producao");
    return { success: "Produção iniciada." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function finishProductionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = "";
  try {
    const user = await requirePermission("production.update");
    const consumptions = rows(form, "consumptions", ["productId", "actualQty"])
      .filter((r) => r.productId);
    const result = await finishProduction(user, {
      id: str(form, "id"),
      producedQty: str(form, "producedQty"),
      lossQty: str(form, "lossQty"),
      notes: optional(form, "notes") ?? undefined,
      consumptions,
    });
    revalidatePath("/producao");
    revalidatePath("/estoque");
    revalidatePath("/");
    // O formulário de finalização deixa de existir depois de concluída, então a
    // confirmação (com o número do lote) vai para a própria tela da ordem.
    target = `/producao/${result.order.id}?lote=${encodeURIComponent(result.batch.code)}&custo=${result.unitCost.toFixed(2)}`;
  } catch (error) {
    return toActionError(error);
  }
  redirect(target);
}

export async function cancelProductionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("production.delete");
    await cancelProduction(user, str(form, "id"), str(form, "reason") || "Sem motivo informado");
    revalidatePath("/producao");
    return { success: "Produção cancelada." };
  } catch (error) {
    return toActionError(error);
  }
}
