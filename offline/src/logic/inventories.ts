import { db, newId, nowIso, registerLog } from "@/data/db";
import type { Inventory, InventoryItem, Product, ProductKind } from "@/data/types";
import { D, ZERO, money, qty, store } from "@/lib/money";
import { brl } from "@/lib/format";
import { BusinessError, nextCode } from "./codes";
import { registerAdjustment } from "./inventory";
import { attachFile } from "./attachments";
import type Decimal from "decimal.js";

export type InventoryScope = "ALL" | "FINISHED" | "RAW" | "PACKAGING";

export const INVENTORY_SCOPE_LABELS: Record<InventoryScope, string> = {
  ALL: "Todos os itens",
  FINISHED: "Produtos acabados",
  RAW: "Matérias-primas",
  PACKAGING: "Embalagens",
};

const KIND_OF_SCOPE: Record<Exclude<InventoryScope, "ALL">, ProductKind[]> = {
  FINISHED: ["FINISHED", "RESALE"],
  RAW: ["RAW"],
  PACKAGING: ["PACKAGING"],
};

/**
 * Abre uma contagem.
 *
 * O saldo do sistema é fotografado na abertura: é contra essa foto que a
 * contagem é comparada, mesmo que o estoque continue se mexendo enquanto a
 * contagem acontece. É o que torna o inventário auditável.
 */
export async function openInventory(input: {
  scope: InventoryScope;
  note?: string | null;
}): Promise<Inventory> {
  const aberto = await db.inventories.where("status").equals("OPEN").first();
  if (aberto) {
    throw new BusinessError(
      `Já existe o inventário ${aberto.code} em contagem. Feche ou cancele antes de abrir outro.`,
    );
  }

  const products = (await db.products.toArray())
    .filter((p) => !p.deletedAt && p.active)
    .filter((p) => input.scope === "ALL" || KIND_OF_SCOPE[input.scope].includes(p.kind))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!products.length) throw new BusinessError("Nenhum produto ativo neste escopo.");

  const inventory: Inventory = {
    id: newId(),
    code: await nextCode("inventory"),
    status: "OPEN",
    scope: input.scope,
    items: products.map((product): InventoryItem => ({
      productId: product.id,
      systemQty: store(D(product.quantity)),
      countedQty: null,
      unitCost: store(D(product.avgCost)),
      countedAt: null,
    })),
    note: input.note ?? null,
    attachmentId: null,
    startedAt: nowIso(),
    finishedAt: null,
    diffValue: null,
  };

  await db.inventories.add(inventory);
  await registerLog(
    "CREATE", "Inventário",
    `Abriu o inventário ${inventory.code} (${INVENTORY_SCOPE_LABELS[input.scope]}, ` +
      `${products.length} itens)`,
    inventory.id,
  );
  return inventory;
}

/** Anota a contagem física de um item. Passar null desfaz a contagem. */
export async function setCount(
  inventoryId: string,
  productId: string,
  countedQty: string | number | null,
) {
  const inventory = await db.inventories.get(inventoryId);
  if (!inventory) throw new BusinessError("Inventário não encontrado.");
  if (inventory.status !== "OPEN") throw new BusinessError("Este inventário já foi fechado.");

  const items = inventory.items.map((item) =>
    item.productId === productId
      ? {
          ...item,
          countedQty: countedQty === null || countedQty === "" ? null : store(qty(countedQty)),
          countedAt: countedQty === null || countedQty === "" ? null : nowIso(),
        }
      : item);

  await db.inventories.update(inventoryId, { items });
}

export type InventoryLine = {
  item: InventoryItem;
  product: Product | undefined;
  diffQty: Decimal;
  diffValue: Decimal;
  counted: boolean;
};

/** Junta a contagem com os produtos e já calcula as divergências. */
export async function inventoryLines(inventory: Inventory): Promise<InventoryLine[]> {
  const products = await db.products.bulkGet(inventory.items.map((i) => i.productId));
  const byId = new Map(
    products.filter((p): p is Product => Boolean(p)).map((p) => [p.id, p]),
  );

  return inventory.items.map((item) => {
    const counted = item.countedQty !== null && item.countedQty !== undefined;
    const diffQty = counted ? qty(D(item.countedQty).minus(D(item.systemQty))) : ZERO;
    return {
      item,
      product: byId.get(item.productId),
      diffQty,
      diffValue: money(diffQty.times(D(item.unitCost))),
      counted,
    };
  });
}

export type InventorySummary = {
  total: number;
  counted: number;
  withDiff: number;
  diffValue: Decimal;
  missingValue: Decimal;
  extraValue: Decimal;
};

export function summarize(lines: InventoryLine[]): InventorySummary {
  let diffValue = ZERO;
  let missingValue = ZERO;
  let extraValue = ZERO;
  let withDiff = 0;

  for (const line of lines) {
    if (!line.counted || line.diffQty.isZero()) continue;
    withDiff++;
    diffValue = diffValue.plus(line.diffValue);
    if (line.diffQty.lessThan(0)) missingValue = missingValue.plus(line.diffValue.abs());
    else extraValue = extraValue.plus(line.diffValue);
  }

  return {
    total: lines.length,
    counted: lines.filter((l) => l.counted).length,
    withDiff,
    diffValue: money(diffValue),
    missingValue: money(missingValue),
    extraValue: money(extraValue),
  };
}

/**
 * Fecha a contagem e acerta o estoque.
 *
 * Só os itens contados entram no acerto: um item não contado continua com o
 * saldo que tinha, em vez de ser zerado por omissão.
 */
export async function closeInventory(input: {
  inventoryId: string;
  reason: string;
  document?: File | null;
}): Promise<InventorySummary> {
  if (!input.reason.trim()) {
    throw new BusinessError("Explique o motivo do fechamento — é o que sustenta a auditoria.");
  }

  const inventory = await db.inventories.get(input.inventoryId);
  if (!inventory) throw new BusinessError("Inventário não encontrado.");
  if (inventory.status !== "OPEN") throw new BusinessError("Este inventário já foi fechado.");

  const lines = await inventoryLines(inventory);
  if (!lines.some((l) => l.counted)) {
    throw new BusinessError("Nenhum item foi contado ainda.");
  }
  const resumo = summarize(lines);

  let attachmentId: string | null = null;
  if (input.document) {
    const attachment = await attachFile(
      { entity: "Inventory", entityId: inventory.id },
      input.document,
      input.reason,
    );
    attachmentId = attachment.id;
  }

  await db.transaction(
    "rw",
    [db.products, db.batches, db.movements, db.inventories, db.logs],
    async () => {
      for (const line of lines) {
        if (!line.counted || line.diffQty.isZero()) continue;
        const movement = await registerAdjustment({
          productId: line.item.productId,
          countedQty: line.item.countedQty!,
          reason: "INVENTORY",
          refType: "Inventory",
          refId: inventory.id,
          note: `Inventário ${inventory.code}: ${input.reason}`,
        });
        if (movement && attachmentId) {
          await db.movements.update(movement.id, { attachmentId });
        }
      }

      await db.inventories.update(inventory.id, {
        status: "CLOSED",
        finishedAt: nowIso(),
        attachmentId,
        note: input.reason,
        diffValue: store(resumo.diffValue),
      });
    },
  );

  await registerLog(
    "CLOSE", "Inventário",
    `Fechou o inventário ${inventory.code}: ${resumo.withDiff} divergência(s), ` +
      `diferença de ${brl(resumo.diffValue)}`,
    inventory.id,
  );
  return resumo;
}

export async function cancelInventory(inventoryId: string, reason: string) {
  const inventory = await db.inventories.get(inventoryId);
  if (!inventory) throw new BusinessError("Inventário não encontrado.");
  if (inventory.status !== "OPEN") throw new BusinessError("Só dá para cancelar uma contagem aberta.");

  await db.inventories.update(inventoryId, {
    status: "CANCELLED",
    finishedAt: nowIso(),
    note: reason,
  });
  await registerLog("CANCEL", "Inventário", `Cancelou o inventário ${inventory.code}: ${reason}`,
    inventoryId);
}
