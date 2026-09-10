import "server-only";
import { Prisma, prisma } from "@/lib/db";
import { D, money, qty, ZERO } from "@/lib/money";
import type { MovementReason } from "@prisma/client";

export class BusinessError extends Error {
  status = 400;
}

type Tx = Prisma.TransactionClient;

export type EntryInput = {
  companyId: string;
  warehouseId: string;
  productId: string;
  quantity: Prisma.Decimal | number | string;
  unitCost?: Prisma.Decimal | number | string;
  reason: MovementReason;
  batchId?: string | null;
  refType?: string | null;
  refId?: string | null;
  productionOrderId?: string | null;
  note?: string | null;
  userId?: string | null;
  /** Se false, a entrada não recalcula o custo médio (ex.: devolução). */
  updateAvgCost?: boolean;
};

export type ExitInput = Omit<EntryInput, "unitCost" | "updateAvgCost"> & {
  /** Permite estoque negativo (ajustes e correções). */
  allowNegative?: boolean;
};

async function balanceRow(tx: Tx, companyId: string, warehouseId: string, productId: string) {
  const existing = await tx.inventory.findUnique({
    where: { warehouseId_productId: { warehouseId, productId } },
  });
  if (existing) return existing;
  return tx.inventory.create({
    data: { companyId, warehouseId, productId, quantity: 0, reserved: 0 },
  });
}

/** Quantidade total do item na empresa (todos os locais) — base do custo médio. */
async function companyQuantity(tx: Tx, companyId: string, productId: string) {
  const agg = await tx.inventory.aggregate({
    where: { companyId, productId },
    _sum: { quantity: true },
  });
  return D(agg._sum.quantity);
}

/**
 * ENTRADA de estoque.
 * Recalcula o custo médio ponderado da empresa:
 *   novoCusto = (qtdAnterior * custoAnterior + qtdEntrada * custoEntrada) / (qtdAnterior + qtdEntrada)
 */
export async function registerEntry(tx: Tx, input: EntryInput) {
  const quantity = qty(input.quantity);
  if (quantity.lessThanOrEqualTo(0)) {
    throw new BusinessError("A quantidade de entrada deve ser maior que zero.");
  }

  const product = await tx.product.findFirst({
    where: { id: input.productId, companyId: input.companyId },
  });
  if (!product) throw new BusinessError("Produto não encontrado.");

  const unitCost = input.unitCost !== undefined ? qty(input.unitCost) : D(product.avgCost);
  const shouldUpdateCost = input.updateAvgCost !== false && unitCost.greaterThan(0);

  if (shouldUpdateCost) {
    const previousQty = await companyQuantity(tx, input.companyId, input.productId);
    const previousCost = D(product.avgCost);
    const totalQty = previousQty.plus(quantity);
    const newAvg = totalQty.greaterThan(0)
      ? previousQty.times(previousCost).plus(quantity.times(unitCost)).dividedBy(totalQty)
      : unitCost;
    await tx.product.update({
      where: { id: product.id },
      data: { avgCost: qty(newAvg), lastCost: unitCost },
    });
  }

  const row = await balanceRow(tx, input.companyId, input.warehouseId, input.productId);
  const balanceAfter = qty(D(row.quantity).plus(quantity));
  await tx.inventory.update({ where: { id: row.id }, data: { quantity: balanceAfter } });

  if (input.batchId) {
    const batch = await tx.batch.findUnique({ where: { id: input.batchId } });
    if (batch) {
      await tx.batch.update({
        where: { id: batch.id },
        data: { availableQty: qty(D(batch.availableQty).plus(quantity)) },
      });
    }
  }

  return tx.inventoryMovement.create({
    data: {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      batchId: input.batchId ?? null,
      type: "IN",
      reason: input.reason,
      quantity,
      unitCost,
      totalCost: money(quantity.times(unitCost)),
      balanceAfter,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      productionOrderId: input.productionOrderId ?? null,
      note: input.note ?? null,
      userId: input.userId ?? null,
    },
  });
}

/**
 * SAÍDA de estoque, valorizada pelo custo médio.
 * Quando o item é rastreado por lote e nenhum lote é informado, aloca por
 * FEFO (First Expired, First Out) — essencial para alimentos.
 * Retorna um movimento por lote consumido.
 */
export async function registerExit(tx: Tx, input: ExitInput) {
  const total = qty(input.quantity);
  if (total.lessThanOrEqualTo(0)) {
    throw new BusinessError("A quantidade de saída deve ser maior que zero.");
  }

  const product = await tx.product.findFirst({
    where: { id: input.productId, companyId: input.companyId },
  });
  if (!product) throw new BusinessError("Produto não encontrado.");

  const row = await balanceRow(tx, input.companyId, input.warehouseId, input.productId);
  const available = D(row.quantity);
  if (!input.allowNegative && available.lessThan(total)) {
    throw new BusinessError(
      `Estoque insuficiente de ${product.name}: disponível ${available.toFixed(3)} ${product.unit}, solicitado ${total.toFixed(3)} ${product.unit}.`,
    );
  }

  // Alocação por lote
  type Allocation = { batchId: string | null; quantity: Prisma.Decimal; unitCost: Prisma.Decimal };
  const allocations: Allocation[] = [];

  if (input.batchId) {
    const batch = await tx.batch.findUnique({ where: { id: input.batchId } });
    if (!batch) throw new BusinessError("Lote não encontrado.");
    if (!input.allowNegative && D(batch.availableQty).lessThan(total)) {
      throw new BusinessError(
        `Lote ${batch.code} possui apenas ${D(batch.availableQty).toFixed(3)} disponível.`,
      );
    }
    allocations.push({ batchId: batch.id, quantity: total, unitCost: D(batch.unitCost).greaterThan(0) ? D(batch.unitCost) : D(product.avgCost) });
  } else if (product.trackBatches) {
    const batches = await tx.batch.findMany({
      where: {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        availableQty: { gt: 0 },
      },
      orderBy: [{ expiresAt: "asc" }, { manufacturedAt: "asc" }],
    });
    let remaining = total;
    for (const batch of batches) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const take = Prisma.Decimal.min(remaining, D(batch.availableQty));
      if (take.lessThanOrEqualTo(0)) continue;
      allocations.push({
        batchId: batch.id,
        quantity: qty(take),
        unitCost: D(batch.unitCost).greaterThan(0) ? D(batch.unitCost) : D(product.avgCost),
      });
      remaining = remaining.minus(take);
    }
    if (remaining.greaterThan(0)) {
      // Sobra sem lote (saldo antigo ou ajuste): sai sem rastreio
      allocations.push({ batchId: null, quantity: qty(remaining), unitCost: D(product.avgCost) });
    }
  } else {
    allocations.push({ batchId: null, quantity: total, unitCost: D(product.avgCost) });
  }

  let balance = available;
  const movements = [];
  for (const allocation of allocations) {
    balance = qty(balance.minus(allocation.quantity));
    if (allocation.batchId) {
      const batch = await tx.batch.findUnique({ where: { id: allocation.batchId } });
      if (batch) {
        await tx.batch.update({
          where: { id: batch.id },
          data: { availableQty: qty(D(batch.availableQty).minus(allocation.quantity)) },
        });
      }
    }
    movements.push(
      await tx.inventoryMovement.create({
        data: {
          companyId: input.companyId,
          warehouseId: input.warehouseId,
          productId: input.productId,
          batchId: allocation.batchId,
          type: "OUT",
          reason: input.reason,
          quantity: allocation.quantity,
          unitCost: allocation.unitCost,
          totalCost: money(allocation.quantity.times(allocation.unitCost)),
          balanceAfter: balance,
          refType: input.refType ?? null,
          refId: input.refId ?? null,
          productionOrderId: input.productionOrderId ?? null,
          note: input.note ?? null,
          userId: input.userId ?? null,
        },
      }),
    );
  }

  await tx.inventory.update({ where: { id: row.id }, data: { quantity: balance } });

  const totalCost = movements.reduce((acc, m) => acc.plus(D(m.totalCost)), ZERO);
  return {
    movements,
    totalCost: money(totalCost),
    unitCost: total.greaterThan(0) ? qty(totalCost.dividedBy(total)) : ZERO,
  };
}

/** AJUSTE: define o saldo do item para uma quantidade contada. */
export async function registerAdjustment(
  tx: Tx,
  input: {
    companyId: string;
    warehouseId: string;
    productId: string;
    countedQty: Prisma.Decimal | number | string;
    note?: string | null;
    userId?: string | null;
  },
) {
  const counted = qty(input.countedQty);
  const row = await balanceRow(tx, input.companyId, input.warehouseId, input.productId);
  const current = D(row.quantity);
  const delta = counted.minus(current);
  if (delta.isZero()) return null;

  const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
  await tx.inventory.update({ where: { id: row.id }, data: { quantity: counted } });

  return tx.inventoryMovement.create({
    data: {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      type: "ADJUST",
      reason: "ADJUSTMENT",
      quantity: delta.abs(),
      unitCost: D(product.avgCost),
      totalCost: money(delta.abs().times(D(product.avgCost))),
      balanceAfter: counted,
      note: input.note ?? `Ajuste de inventário: ${current.toFixed(3)} → ${counted.toFixed(3)}`,
      userId: input.userId ?? null,
    },
  });
}

/** Saldo consolidado por item (todos os locais da empresa). */
export async function stockLevels(companyId: string, kinds?: ("FINISHED" | "RAW" | "PACKAGING" | "RESALE")[]) {
  const products = await prisma.product.findMany({
    where: {
      companyId,
      deletedAt: null,
      ...(kinds?.length ? { kind: { in: kinds } } : {}),
    },
    include: { inventory: true, category: true },
    orderBy: { name: "asc" },
  });

  return products.map((p) => {
    const quantity = p.inventory.reduce((acc, i) => acc.plus(D(i.quantity)), ZERO);
    const reserved = p.inventory.reduce((acc, i) => acc.plus(D(i.reserved)), ZERO);
    const availableQty = quantity.minus(reserved);
    return {
      product: p,
      quantity,
      reserved,
      available: availableQty,
      value: money(quantity.times(D(p.avgCost))),
      belowMin: quantity.lessThan(D(p.minStock)) && D(p.minStock).greaterThan(0),
      aboveMax: p.maxStock ? quantity.greaterThan(D(p.maxStock)) : false,
    };
  });
}
