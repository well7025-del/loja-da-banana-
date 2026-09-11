import { db, newId, nowIso } from "@/data/db";
import type { Batch, Movement, MovementReason, Product } from "@/data/types";
import { D, ZERO, money, qty, store } from "@/lib/money";
import { BusinessError } from "./codes";
import type Decimal from "decimal.js";

/** Movimento registrado, já com o custo apurado. */
export type ExitResult = {
  movements: Movement[];
  totalCost: Decimal;
  unitCost: Decimal;
};

/**
 * ENTRADA de estoque, recalculando o custo médio ponderado:
 *   novo = (qtd_anterior × custo_anterior + qtd_entrada × custo_entrada)
 *          ÷ (qtd_anterior + qtd_entrada)
 *
 * Deve ser chamada dentro de uma transação Dexie de escrita.
 */
export async function registerEntry(input: {
  productId: string;
  quantity: Decimal | number | string;
  unitCost?: Decimal | number | string;
  reason: MovementReason;
  batchId?: string | null;
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
  /** Devoluções não devem mexer no custo médio. */
  updateAvgCost?: boolean;
}): Promise<Movement> {
  const quantity = qty(input.quantity);
  if (quantity.lessThanOrEqualTo(0)) {
    throw new BusinessError("A quantidade de entrada deve ser maior que zero.");
  }

  const product = await db.products.get(input.productId);
  if (!product) throw new BusinessError("Produto não encontrado.");

  const unitCost = input.unitCost !== undefined ? qty(input.unitCost) : D(product.avgCost);
  const previousQty = D(product.quantity);
  const balanceAfter = qty(previousQty.plus(quantity));

  let avgCost = D(product.avgCost);
  if (input.updateAvgCost !== false && unitCost.greaterThan(0)) {
    const total = previousQty.plus(quantity);
    avgCost = total.greaterThan(0)
      ? qty(previousQty.times(avgCost).plus(quantity.times(unitCost)).dividedBy(total))
      : unitCost;
  }

  await db.products.update(product.id, {
    quantity: store(balanceAfter),
    avgCost: store(avgCost),
    lastCost: store(unitCost),
    updatedAt: nowIso(),
  });

  if (input.batchId) {
    const batch = await db.batches.get(input.batchId);
    if (batch) {
      await db.batches.update(batch.id, {
        availableQty: store(qty(D(batch.availableQty).plus(quantity))),
      });
    }
  }

  const movement: Movement = {
    id: newId(),
    productId: product.id,
    batchId: input.batchId ?? null,
    type: "IN",
    reason: input.reason,
    quantity: store(quantity),
    unitCost: store(unitCost),
    totalCost: store(money(quantity.times(unitCost))),
    balanceAfter: store(balanceAfter),
    refType: input.refType ?? null,
    refId: input.refId ?? null,
    note: input.note ?? null,
    createdAt: nowIso(),
  };
  await db.movements.add(movement);
  return movement;
}

/**
 * SAÍDA de estoque valorizada pelo custo médio.
 * Quando o item é rastreado por lote, consome primeiro o que vence antes
 * (FEFO) — essencial para alimentos.
 */
export async function registerExit(input: {
  productId: string;
  quantity: Decimal | number | string;
  reason: MovementReason;
  batchId?: string | null;
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
  allowNegative?: boolean;
}): Promise<ExitResult> {
  const total = qty(input.quantity);
  if (total.lessThanOrEqualTo(0)) {
    throw new BusinessError("A quantidade de saída deve ser maior que zero.");
  }

  const product = await db.products.get(input.productId);
  if (!product) throw new BusinessError("Produto não encontrado.");

  const available = D(product.quantity);
  if (!input.allowNegative && available.lessThan(total)) {
    throw new BusinessError(
      `Estoque insuficiente de ${product.name}: disponível ${available.toFixed(3)}, ` +
        `solicitado ${total.toFixed(3)}.`,
    );
  }

  type Allocation = { batchId: string | null; quantity: Decimal; unitCost: Decimal };
  const allocations: Allocation[] = [];

  if (input.batchId) {
    const batch = await db.batches.get(input.batchId);
    if (!batch) throw new BusinessError("Lote não encontrado.");
    allocations.push({
      batchId: batch.id,
      quantity: total,
      unitCost: D(batch.unitCost).greaterThan(0) ? D(batch.unitCost) : D(product.avgCost),
    });
  } else if (product.trackBatches) {
    const batches = (await db.batches.where("productId").equals(product.id).toArray())
      .filter((b) => D(b.availableQty).greaterThan(0))
      .sort(compareFefo);

    let remaining = total;
    for (const batch of batches) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const take = Decimal_min(remaining, D(batch.availableQty));
      if (take.lessThanOrEqualTo(0)) continue;
      allocations.push({
        batchId: batch.id,
        quantity: qty(take),
        unitCost: D(batch.unitCost).greaterThan(0) ? D(batch.unitCost) : D(product.avgCost),
      });
      remaining = remaining.minus(take);
    }
    if (remaining.greaterThan(0)) {
      // Saldo sem lote (entrada antiga ou ajuste): sai sem rastreio.
      allocations.push({ batchId: null, quantity: qty(remaining), unitCost: D(product.avgCost) });
    }
  } else {
    allocations.push({ batchId: null, quantity: total, unitCost: D(product.avgCost) });
  }

  let balance = available;
  const movements: Movement[] = [];

  for (const allocation of allocations) {
    balance = qty(balance.minus(allocation.quantity));

    if (allocation.batchId) {
      const batch = await db.batches.get(allocation.batchId);
      if (batch) {
        await db.batches.update(batch.id, {
          availableQty: store(qty(D(batch.availableQty).minus(allocation.quantity))),
        });
      }
    }

    const movement: Movement = {
      id: newId(),
      productId: product.id,
      batchId: allocation.batchId,
      type: "OUT",
      reason: input.reason,
      quantity: store(allocation.quantity),
      unitCost: store(allocation.unitCost),
      totalCost: store(money(allocation.quantity.times(allocation.unitCost))),
      balanceAfter: store(balance),
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      note: input.note ?? null,
      createdAt: nowIso(),
    };
    await db.movements.add(movement);
    movements.push(movement);
  }

  await db.products.update(product.id, { quantity: store(balance), updatedAt: nowIso() });

  const totalCost = movements.reduce((acc, m) => acc.plus(D(m.totalCost)), ZERO);
  return {
    movements,
    totalCost: money(totalCost),
    unitCost: total.greaterThan(0) ? qty(totalCost.dividedBy(total)) : ZERO,
  };
}

/** AJUSTE: leva o saldo para a quantidade contada e registra a diferença. */
export async function registerAdjustment(input: {
  productId: string;
  countedQty: Decimal | number | string;
  note?: string | null;
}): Promise<Movement | null> {
  const counted = qty(input.countedQty);
  const product = await db.products.get(input.productId);
  if (!product) throw new BusinessError("Produto não encontrado.");

  const current = D(product.quantity);
  const delta = counted.minus(current);
  if (delta.isZero()) return null;

  await db.products.update(product.id, { quantity: store(counted), updatedAt: nowIso() });

  const movement: Movement = {
    id: newId(),
    productId: product.id,
    batchId: null,
    type: "ADJUST",
    reason: "ADJUSTMENT",
    quantity: store(delta.abs()),
    unitCost: store(D(product.avgCost)),
    totalCost: store(money(delta.abs().times(D(product.avgCost)))),
    balanceAfter: store(counted),
    refType: null,
    refId: null,
    note: input.note ?? `Ajuste: ${current.toFixed(3)} → ${counted.toFixed(3)}`,
    createdAt: nowIso(),
  };
  await db.movements.add(movement);
  return movement;
}

/** Primeiro o que vence antes; sem validade, o mais antigo. */
function compareFefo(a: Batch, b: Batch): number {
  if (a.expiresAt && b.expiresAt) return a.expiresAt.localeCompare(b.expiresAt);
  if (a.expiresAt) return -1;
  if (b.expiresAt) return 1;
  return a.manufacturedAt.localeCompare(b.manufacturedAt);
}

function Decimal_min(a: Decimal, b: Decimal): Decimal {
  return a.lessThan(b) ? a : b;
}

export function stockOf(product: Product) {
  return D(product.quantity);
}

export function isBelowMin(product: Product) {
  return D(product.minStock).greaterThan(0) && D(product.quantity).lessThan(D(product.minStock));
}
