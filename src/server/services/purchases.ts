import "server-only";
import { Prisma, prisma } from "@/lib/db";
import { D, money, qty, ZERO } from "@/lib/money";
import { nextCode } from "@/lib/codes";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { BusinessError, registerEntry } from "./inventory";
import { brl } from "@/lib/format";

export type PurchaseItemInput = {
  productId: string;
  quantity: string | number;
  unitPrice: string | number;
  batchCode?: string;
  expiresAt?: string | null;
};

export async function createPurchaseOrder(
  user: SessionUser,
  input: {
    supplierId: string;
    items: PurchaseItemInput[];
    freight?: string | number;
    discount?: string | number;
    paymentTerms?: string;
    dueDate?: string | null;
    notes?: string;
    /** Recebe a mercadoria imediatamente (compra no balcão). */
    receiveNow?: boolean;
    warehouseId: string;
  },
) {
  if (!input.items?.length) throw new BusinessError("Adicione ao menos um item à compra.");

  let subtotal = ZERO;
  const lines = input.items.map((item) => {
    const quantity = qty(item.quantity);
    const unitPrice = qty(item.unitPrice);
    if (quantity.lessThanOrEqualTo(0)) throw new BusinessError("Quantidade inválida na compra.");
    const total = money(quantity.times(unitPrice));
    subtotal = subtotal.plus(total);
    return { ...item, quantity, unitPrice, total };
  });

  const freight = money(input.freight ?? 0);
  const discount = money(input.discount ?? 0);
  const total = money(subtotal.plus(freight).minus(discount));

  const purchase = await prisma.$transaction(async (tx) => {
    const number = await nextCode(tx, "purchase", user.companyId);
    const created = await tx.purchaseOrder.create({
      data: {
        companyId: user.companyId,
        number,
        supplierId: input.supplierId,
        status: "ORDERED",
        subtotal: money(subtotal),
        freight,
        discount,
        total,
        paymentTerms: input.paymentTerms ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        notes: input.notes ?? null,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            total: l.total,
            batchCode: l.batchCode ?? null,
            expiresAt: l.expiresAt ? new Date(l.expiresAt) : null,
          })),
        },
      },
      include: { items: true, supplier: true },
    });
    await audit(
      { user, action: "CREATE", entity: "PurchaseOrder", entityId: created.id, summary: `Compra ${number} — ${created.supplier.name} — ${brl(total)}` },
      tx,
    );
    return created;
  });

  if (input.receiveNow) {
    return receivePurchase(user, {
      purchaseOrderId: purchase.id,
      warehouseId: input.warehouseId,
      items: purchase.items.map((i) => ({
        purchaseItemId: i.id,
        receivedQty: D(i.quantity).toString(),
        batchCode: i.batchCode ?? undefined,
        expiresAt: i.expiresAt ? i.expiresAt.toISOString() : undefined,
      })),
    });
  }

  return purchase;
}

/**
 * Recebimento da mercadoria:
 * cria lote, dá entrada no estoque (recalculando o custo médio) e gera a conta a pagar.
 * O frete e o desconto do pedido são rateados no custo unitário pelo valor de cada item.
 */
export async function receivePurchase(
  user: SessionUser,
  input: {
    purchaseOrderId: string;
    warehouseId: string;
    items: { purchaseItemId: string; receivedQty: string | number; batchCode?: string; expiresAt?: string }[];
    generatePayable?: boolean;
  },
) {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, companyId: user.companyId, deletedAt: null },
      include: { items: { include: { product: true } }, supplier: true },
    });
    if (!po) throw new BusinessError("Pedido de compra não encontrado.");
    if (po.status === "RECEIVED") throw new BusinessError("Esta compra já foi totalmente recebida.");
    if (po.status === "CANCELLED") throw new BusinessError("Esta compra foi cancelada.");

    const extras = D(po.freight).minus(D(po.discount));
    const subtotal = D(po.subtotal);

    for (const line of input.items) {
      const item = po.items.find((i) => i.id === line.purchaseItemId);
      if (!item) continue;
      const receivedQty = qty(line.receivedQty);
      if (receivedQty.lessThanOrEqualTo(0)) continue;

      // Rateio de frete/desconto: proporcional ao valor do item no pedido e,
      // em recebimento parcial, apenas à fração efetivamente recebida.
      const lineShare = subtotal.greaterThan(0) ? D(item.total).dividedBy(subtotal) : ZERO;
      const receivedShare = D(item.quantity).greaterThan(0)
        ? receivedQty.dividedBy(D(item.quantity))
        : new Prisma.Decimal(1);
      const lineExtras = extras.times(lineShare).times(receivedShare);
      const landedUnitCost = qty(
        D(item.unitPrice).plus(receivedQty.greaterThan(0) ? lineExtras.dividedBy(receivedQty) : ZERO),
      );

      let batchId: string | null = null;
      if (item.product.trackBatches) {
        const code = line.batchCode?.trim()
          ? `${line.batchCode.trim()}`
          : await nextCode(tx, "batch", user.companyId);
        const existing = await tx.batch.findFirst({
          where: { companyId: user.companyId, code },
        });
        const batch = existing
          ? await tx.batch.update({
              where: { id: existing.id },
              data: { producedQty: qty(D(existing.producedQty).plus(receivedQty)) },
            })
          : await tx.batch.create({
              data: {
                companyId: user.companyId,
                warehouseId: input.warehouseId,
                productId: item.productId,
                code,
                origin: "PURCHASE",
                producedQty: receivedQty,
                availableQty: 0,
                unitCost: landedUnitCost,
                manufacturedAt: new Date(),
                expiresAt: line.expiresAt
                  ? new Date(line.expiresAt)
                  : item.expiresAt ?? null,
                supplierId: po.supplierId,
                supplierBatchCode: line.batchCode ?? null,
              },
            });
        batchId = batch.id;
      }

      await registerEntry(tx, {
        companyId: user.companyId,
        warehouseId: input.warehouseId,
        productId: item.productId,
        quantity: receivedQty,
        unitCost: landedUnitCost,
        reason: "PURCHASE",
        batchId,
        refType: "PurchaseOrder",
        refId: po.id,
        note: `Recebimento da compra ${po.number}`,
        userId: user.id,
      });

      await tx.purchaseItem.update({
        where: { id: item.id },
        data: { receivedQty: qty(D(item.receivedQty).plus(receivedQty)) },
      });
    }

    const refreshed = await tx.purchaseItem.findMany({ where: { purchaseOrderId: po.id } });
    const fullyReceived = refreshed.every((i) => D(i.receivedQty).greaterThanOrEqualTo(D(i.quantity)));

    const updated = await tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: fullyReceived ? "RECEIVED" : "PARTIAL",
        receivedAt: fullyReceived ? new Date() : po.receivedAt,
      },
      include: { supplier: true },
    });

    // Conta a pagar (uma vez, no primeiro recebimento)
    if (input.generatePayable !== false) {
      const already = await tx.financeEntry.count({ where: { purchaseOrderId: po.id } });
      if (already === 0) {
        const category = await tx.financeCategory.findFirst({
          where: { name: "Matéria-prima", direction: "PAYABLE" },
        });
        await tx.financeEntry.create({
          data: {
            companyId: user.companyId,
            direction: "PAYABLE",
            status: "OPEN",
            description: `Compra ${po.number} — ${po.supplier.name}`,
            categoryId: category?.id ?? null,
            supplierId: po.supplierId,
            purchaseOrderId: po.id,
            amount: D(po.total),
            dueDate: po.dueDate ?? new Date(),
          },
        });
      }
    }

    await audit(
      { user, action: "UPDATE", entity: "PurchaseOrder", entityId: po.id, summary: `Recebeu a compra ${po.number}` },
      tx,
    );
    return updated;
  }, { timeout: 20000 });
}

/** Histórico de preços pagos por item ao fornecedor. */
export async function supplierPriceHistory(companyId: string, productId: string) {
  return prisma.purchaseItem.findMany({
    where: { productId, purchaseOrder: { companyId, deletedAt: null } },
    include: { purchaseOrder: { include: { supplier: true } } },
    orderBy: { purchaseOrder: { orderedAt: "desc" } },
    take: 20,
  });
}
