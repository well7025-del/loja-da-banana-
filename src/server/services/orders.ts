import "server-only";
import { Prisma, prisma } from "@/lib/db";
import { D, money, qty, ZERO } from "@/lib/money";
import { nextCode } from "@/lib/codes";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { BusinessError } from "./inventory";
import { quoteSale } from "./sales";
import type { OrderStatus, PaymentMethod, SaleChannel } from "@prisma/client";
import { brl } from "@/lib/format";

/** Status a partir dos quais o estoque fica reservado para o pedido. */
const RESERVING: OrderStatus[] = ["CONFIRMED", "PICKING", "IN_PRODUCTION", "READY", "DISPATCHED"];

export async function createOrder(
  user: SessionUser,
  input: {
    customerId: string;
    items: { productId: string; quantity: string | number; unitPrice?: string | number; discountPct?: string | number }[];
    channel?: SaleChannel;
    paymentMethod?: PaymentMethod;
    deliveryDate?: string | null;
    deliveryAddress?: string;
    freight?: string | number;
    notes?: string;
  },
) {
  if (!input.items?.length) throw new BusinessError("Adicione ao menos um produto ao pedido.");
  const quote = await quoteSale(user.companyId, {
    customerId: input.customerId,
    channel: input.channel ?? "WHOLESALE",
    items: input.items,
    freight: input.freight,
  });

  return prisma.$transaction(async (tx) => {
    const number = await nextCode(tx, "order", user.companyId);
    const order = await tx.order.create({
      data: {
        companyId: user.companyId,
        number,
        customerId: input.customerId,
        channel: input.channel ?? "WHOLESALE",
        subtotal: quote.subtotal,
        discount: quote.discount,
        freight: quote.freight,
        total: quote.total,
        paymentMethod: input.paymentMethod ?? "PIX",
        deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
        deliveryAddress: input.deliveryAddress ?? null,
        notes: input.notes ?? null,
        items: {
          create: quote.lines.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountPct: l.discountPct,
            discount: l.discount,
            total: l.total,
          })),
        },
      },
      include: { items: true, customer: true },
    });
    await audit(
      { user, action: "CREATE", entity: "Order", entityId: order.id, summary: `Pedido ${number} — ${order.customer.name} — ${brl(quote.total)}` },
      tx,
    );
    return order;
  }, { timeout: 20000 });
}

/** Muda o status do pedido e ajusta a reserva de estoque. */
export async function changeOrderStatus(user: SessionUser, orderId: string, status: OrderStatus) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, companyId: user.companyId, deletedAt: null },
      include: { items: true },
    });
    if (!order) throw new BusinessError("Pedido não encontrado.");
    if (order.status === "DELIVERED") throw new BusinessError("Pedido entregue não pode mudar de status.");

    const shouldReserve = RESERVING.includes(status);
    const warehouse = await tx.warehouse.findFirstOrThrow({
      where: { companyId: user.companyId, isDefault: true },
    });

    if (shouldReserve !== order.reserved) {
      for (const item of order.items) {
        const row = await tx.inventory.findUnique({
          where: { warehouseId_productId: { warehouseId: warehouse.id, productId: item.productId } },
        });
        if (!row) continue;
        const delta = shouldReserve ? D(item.quantity) : D(item.quantity).negated();
        await tx.inventory.update({
          where: { id: row.id },
          data: { reserved: qty(Prisma.Decimal.max(ZERO, D(row.reserved).plus(delta))) },
        });
      }
    }

    const updated = await tx.order.update({
      where: { id: order.id },
      data: { status, reserved: shouldReserve },
    });
    await audit(
      { user, action: "UPDATE", entity: "Order", entityId: order.id, summary: `Pedido ${order.number}: ${order.status} → ${status}` },
      tx,
    );
    return updated;
  }, { timeout: 20000 });
}

/** Libera a reserva do pedido (ao faturar ou cancelar). */
export async function releaseReservation(tx: Prisma.TransactionClient, orderId: string, companyId: string) {
  const order = await tx.order.findFirst({
    where: { id: orderId, companyId },
    include: { items: true },
  });
  if (!order?.reserved) return;
  const warehouse = await tx.warehouse.findFirstOrThrow({ where: { companyId, isDefault: true } });
  for (const item of order.items) {
    const row = await tx.inventory.findUnique({
      where: { warehouseId_productId: { warehouseId: warehouse.id, productId: item.productId } },
    });
    if (!row) continue;
    await tx.inventory.update({
      where: { id: row.id },
      data: { reserved: qty(Prisma.Decimal.max(ZERO, D(row.reserved).minus(D(item.quantity)))) },
    });
  }
  await tx.order.update({ where: { id: order.id }, data: { reserved: false } });
}

export async function cancelOrder(user: SessionUser, orderId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    await releaseReservation(tx, orderId, user.companyId);
    const order = await tx.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED", notes: reason },
    });
    await audit({ user, action: "CANCEL", entity: "Order", entityId: orderId, summary: `Cancelou pedido ${order.number}: ${reason}` }, tx);
    return order;
  });
}

/** Necessidade de produção para atender os pedidos em aberto. */
export async function productionNeeds(companyId: string) {
  const items = await prisma.orderItem.findMany({
    where: { order: { companyId, deletedAt: null, status: { in: ["CONFIRMED", "PICKING", "IN_PRODUCTION"] } } },
    include: { product: { include: { inventory: true } } },
  });
  const map = new Map<string, { name: string; unit: string; productId: string; needed: Prisma.Decimal; stock: Prisma.Decimal }>();
  for (const item of items) {
    const cur = map.get(item.productId) ?? {
      productId: item.productId, name: item.product.name, unit: item.product.unit,
      needed: ZERO,
      stock: item.product.inventory.reduce((a, i) => a.plus(D(i.quantity)), ZERO),
    };
    cur.needed = cur.needed.plus(D(item.quantity));
    map.set(item.productId, cur);
  }
  return [...map.values()]
    .map((r) => ({ ...r, missing: qty(Prisma.Decimal.max(ZERO, r.needed.minus(r.stock))) }))
    .filter((r) => r.missing.greaterThan(0));
}
