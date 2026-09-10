"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { nextCode } from "@/lib/codes";
import { qty } from "@/lib/money";
import { registerAdjustment, registerEntry, registerExit } from "@/server/services/inventory";
import { type ActionState, optional, str, toActionError } from "./_helpers";
import type { MovementReason } from "@prisma/client";

async function defaultWarehouse(companyId: string, requested?: string | null) {
  if (requested) {
    const found = await prisma.warehouse.findFirst({ where: { id: requested, companyId } });
    if (found) return found;
  }
  return prisma.warehouse.findFirstOrThrow({ where: { companyId, isDefault: true } });
}

export async function stockEntryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("stock.create");
    const productId = str(form, "productId");
    if (!productId) return { error: "Selecione o produto." };
    const quantity = qty(str(form, "quantity"));
    if (quantity.lessThanOrEqualTo(0)) return { error: "Informe a quantidade." };

    const warehouse = await defaultWarehouse(user.companyId, optional(form, "warehouseId"));
    const product = await prisma.product.findFirstOrThrow({ where: { id: productId, companyId: user.companyId } });
    const unitCostRaw = str(form, "unitCost");

    await prisma.$transaction(async (tx) => {
      let batchId: string | null = null;
      if (product.trackBatches) {
        const code = str(form, "batchCode") || (await nextCode(tx, "batch", user.companyId));
        const expiresRaw = str(form, "expiresAt");
        const batch = await tx.batch.create({
          data: {
            companyId: user.companyId,
            warehouseId: warehouse.id,
            productId,
            code,
            origin: "PURCHASE",
            producedQty: quantity,
            availableQty: 0,
            unitCost: unitCostRaw ? qty(unitCostRaw) : product.avgCost,
            manufacturedAt: new Date(),
            expiresAt: expiresRaw
              ? new Date(expiresRaw)
              : product.shelfLifeDays
                ? new Date(Date.now() + product.shelfLifeDays * 86400000)
                : null,
            supplierId: optional(form, "supplierId"),
          },
        });
        batchId = batch.id;
      }

      await registerEntry(tx, {
        companyId: user.companyId,
        warehouseId: warehouse.id,
        productId,
        quantity,
        unitCost: unitCostRaw ? qty(unitCostRaw) : undefined,
        reason: (str(form, "reason") || "PURCHASE") as MovementReason,
        batchId,
        note: optional(form, "note"),
        userId: user.id,
      });

      await audit({
        user, action: "CREATE", entity: "InventoryMovement",
        summary: `Entrada de ${quantity.toFixed(3)} ${product.unit} de ${product.name}`,
      }, tx);
    });

    revalidatePath("/estoque");
    revalidatePath("/");
    return { success: `Entrada registrada: ${quantity.toFixed(3)} ${product.unit} de ${product.name}.` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function stockExitAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("stock.create");
    const productId = str(form, "productId");
    if (!productId) return { error: "Selecione o produto." };
    const quantity = qty(str(form, "quantity"));
    if (quantity.lessThanOrEqualTo(0)) return { error: "Informe a quantidade." };

    const warehouse = await defaultWarehouse(user.companyId, optional(form, "warehouseId"));
    const product = await prisma.product.findFirstOrThrow({ where: { id: productId, companyId: user.companyId } });

    await prisma.$transaction(async (tx) => {
      await registerExit(tx, {
        companyId: user.companyId,
        warehouseId: warehouse.id,
        productId,
        quantity,
        reason: (str(form, "reason") || "LOSS") as MovementReason,
        batchId: optional(form, "batchId"),
        note: optional(form, "note"),
        userId: user.id,
      });
      await audit({
        user, action: "CREATE", entity: "InventoryMovement",
        summary: `Saída de ${quantity.toFixed(3)} ${product.unit} de ${product.name} (${str(form, "reason")})`,
      }, tx);
    });

    revalidatePath("/estoque");
    revalidatePath("/");
    return { success: `Saída registrada: ${quantity.toFixed(3)} ${product.unit} de ${product.name}.` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function stockAdjustAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("stock.update");
    const productId = str(form, "productId");
    if (!productId) return { error: "Selecione o produto." };
    const counted = qty(str(form, "countedQty"));
    const warehouse = await defaultWarehouse(user.companyId, optional(form, "warehouseId"));
    const product = await prisma.product.findFirstOrThrow({ where: { id: productId, companyId: user.companyId } });

    await prisma.$transaction(async (tx) => {
      const movement = await registerAdjustment(tx, {
        companyId: user.companyId,
        warehouseId: warehouse.id,
        productId,
        countedQty: counted,
        note: optional(form, "note"),
        userId: user.id,
      });
      if (movement) {
        await audit({
          user, action: "UPDATE", entity: "InventoryMovement",
          summary: `Ajuste de inventário em ${product.name}: saldo ${counted.toFixed(3)} ${product.unit}`,
        }, tx);
      }
    });

    revalidatePath("/estoque");
    return { success: `Saldo de ${product.name} ajustado para ${counted.toFixed(3)} ${product.unit}.` };
  } catch (error) {
    return toActionError(error);
  }
}
