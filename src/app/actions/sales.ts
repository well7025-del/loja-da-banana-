"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { cancelSale, createSale } from "@/server/services/sales";
import { changeOrderStatus, cancelOrder, createOrder } from "@/server/services/orders";
import { type ActionState, optional, rows, str, toActionError } from "./_helpers";
import type { OrderStatus, PaymentMethod, SaleChannel } from "@prisma/client";

export async function createSaleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = "";
  try {
    const user = await requirePermission("sales.create");
    const warehouse = await prisma.warehouse.findFirstOrThrow({
      where: { companyId: user.companyId, isDefault: true },
    });
    const items = rows(form, "items", ["productId", "quantity", "unitPrice", "discountPct"])
      .filter((r) => r.productId && Number(r.quantity.replace(",", ".")) > 0);
    if (!items.length) return { error: "Adicione ao menos um produto à venda." };

    const sale = await createSale(user, {
      customerId: optional(form, "customerId"),
      warehouseId: warehouse.id,
      channel: (str(form, "channel") || "RETAIL") as SaleChannel,
      items,
      paymentMethod: (str(form, "paymentMethod") || "PIX") as PaymentMethod,
      installments: Number(str(form, "installments") || 1),
      dueDate: optional(form, "dueDate"),
      freight: str(form, "freight"),
      extraDiscount: str(form, "extraDiscount"),
      notes: optional(form, "notes") ?? undefined,
      orderId: optional(form, "orderId"),
    });
    revalidatePath("/vendas");
    revalidatePath("/");
    target = `/vendas/${sale.id}?ok=1`;
  } catch (error) {
    return toActionError(error);
  }
  redirect(target);
}

export async function cancelSaleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("sales.delete");
    await cancelSale(user, str(form, "id"), str(form, "reason") || "Sem motivo informado");
    revalidatePath("/vendas");
    return { success: "Venda cancelada e estoque estornado." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function createOrderAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = "";
  try {
    const user = await requirePermission("orders.create");
    const items = rows(form, "items", ["productId", "quantity", "unitPrice", "discountPct"])
      .filter((r) => r.productId && Number(r.quantity.replace(",", ".")) > 0);
    if (!items.length) return { error: "Adicione ao menos um produto ao pedido." };
    const customerId = str(form, "customerId");
    if (!customerId) return { error: "Selecione o cliente do pedido." };

    const order = await createOrder(user, {
      customerId,
      items,
      channel: (str(form, "channel") || "WHOLESALE") as SaleChannel,
      paymentMethod: (str(form, "paymentMethod") || "PIX") as PaymentMethod,
      deliveryDate: optional(form, "deliveryDate"),
      deliveryAddress: optional(form, "deliveryAddress") ?? undefined,
      freight: str(form, "freight"),
      notes: optional(form, "notes") ?? undefined,
    });
    revalidatePath("/pedidos");
    target = `/pedidos/${order.id}`;
  } catch (error) {
    return toActionError(error);
  }
  redirect(target);
}

export async function changeOrderStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("orders.update");
    await changeOrderStatus(user, str(form, "id"), str(form, "status") as OrderStatus);
    revalidatePath("/pedidos");
    return { success: "Status do pedido atualizado." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function cancelOrderAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("orders.delete");
    await cancelOrder(user, str(form, "id"), str(form, "reason") || "Sem motivo informado");
    revalidatePath("/pedidos");
    return { success: "Pedido cancelado." };
  } catch (error) {
    return toActionError(error);
  }
}

/** Fatura o pedido: gera a venda, baixa o estoque e libera a reserva. */
export async function invoiceOrderAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = "";
  try {
    const user = await requirePermission("sales.create");
    const orderId = str(form, "id");
    const order = await prisma.order.findFirstOrThrow({
      where: { id: orderId, companyId: user.companyId, deletedAt: null },
      include: { items: true, sale: { select: { id: true } } },
    });
    if (order.status === "CANCELLED") return { error: "Pedido cancelado não pode ser faturado." };
    if (order.sale) return { error: "Este pedido já foi faturado." };

    const warehouse = await prisma.warehouse.findFirstOrThrow({
      where: { companyId: user.companyId, isDefault: true },
    });
    const { releaseReservation } = await import("@/server/services/orders");
    await prisma.$transaction((tx) => releaseReservation(tx, orderId, user.companyId));

    const sale = await createSale(user, {
      customerId: order.customerId,
      warehouseId: warehouse.id,
      channel: order.channel,
      items: order.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity.toString(),
        unitPrice: i.unitPrice.toString(),
        discountPct: i.discountPct.toString(),
      })),
      paymentMethod: order.paymentMethod,
      freight: order.freight.toString(),
      orderId: order.id,
      notes: `Faturamento do pedido ${order.number}`,
    });
    revalidatePath("/pedidos");
    revalidatePath("/vendas");
    target = `/vendas/${sale.id}?ok=1`;
  } catch (error) {
    return toActionError(error);
  }
  redirect(target);
}
