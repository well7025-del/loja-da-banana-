import { db, newId, nowIso, registerLog } from "@/data/db";
import type { Movement, Product } from "@/data/types";
import type { StockAdjustmentKind } from "@/lib/defaults";
import { D, money, store } from "@/lib/money";
import { brl } from "@/lib/format";
import { BusinessError } from "./codes";
import { registerAdjustment, registerEntry, registerExit } from "./inventory";
import { attachFile } from "./attachments";

/**
 * Ajuste extraordinário de estoque: perda, devolução, inventário ou balanço.
 *
 * Diferente da entrada e da saída do dia a dia, estes lançamentos mexem no
 * saldo sem uma compra ou venda por trás — por isso exigem justificativa e
 * aceitam o documento que autoriza o lançamento.
 */
export async function registerStockAdjustment(input: {
  kind: StockAdjustmentKind;
  productId: string;
  /** Quantidade movimentada (perda, devolução) ou saldo contado (inventário). */
  value: string | number;
  reason: string;
  document?: File | null;
  unitCost?: string | number | null;
}): Promise<Movement> {
  if (!input.reason.trim()) {
    throw new BusinessError("Ajustes extraordinários exigem uma justificativa.");
  }

  const product = await db.products.get(input.productId);
  if (!product) throw new BusinessError("Produto não encontrado.");

  const movement = await db.transaction(
    "rw",
    [db.products, db.batches, db.movements, db.logs],
    async () => {
      switch (input.kind) {
        case "LOSS":
          return registerExit({
            productId: product.id,
            quantity: input.value,
            reason: "LOSS",
            note: `Perda: ${input.reason}`,
            // Perda registrada depois do fato não pode travar por saldo.
            allowNegative: true,
          }).then((result) => {
            const first = result.movements[0];
            if (!first) throw new BusinessError("Nada foi baixado do estoque.");
            return first;
          });

        case "RETURN_IN":
          return registerEntry({
            productId: product.id,
            quantity: input.value,
            unitCost: input.unitCost ?? product.avgCost,
            reason: "RETURN_IN",
            note: `Devolução: ${input.reason}`,
            // A devolução volta pelo custo que saiu: não mexe no custo médio.
            updateAvgCost: false,
          });

        case "INVENTORY":
        case "ADJUSTMENT": {
          const result = await registerAdjustment({
            productId: product.id,
            countedQty: input.value,
            reason: input.kind === "INVENTORY" ? "INVENTORY" : "ADJUSTMENT",
            note: `${input.kind === "INVENTORY" ? "Inventário" : "Balanço"}: ${input.reason}`,
          });
          if (!result) {
            throw new BusinessError(
              "O saldo contado é igual ao saldo do sistema — não há o que ajustar.",
            );
          }
          return result;
        }
      }
    },
  );

  if (input.document) {
    const attachment = await attachFile(
      { entity: "Movement", entityId: movement.id },
      input.document,
      input.reason,
    );
    await db.movements.update(movement.id, { attachmentId: attachment.id });
    movement.attachmentId = attachment.id;
  }

  await registerLog(
    "ADJUST", "Estoque",
    `${labelOf(input.kind)} de ${product.name}: ${input.reason}` +
      (input.document ? " (com documento anexado)" : ""),
    movement.id,
  );
  return movement;
}

function labelOf(kind: StockAdjustmentKind): string {
  return { LOSS: "Perda", RETURN_IN: "Devolução", INVENTORY: "Inventário", ADJUSTMENT: "Balanço" }[kind];
}

/** Valor financeiro de um ajuste, para o relatório de auditoria. */
export function adjustmentValue(movement: Movement) {
  return money(D(movement.quantity).times(D(movement.unitCost)));
}

// ---------------------------------------------------------------------------
// Alteração de preço com documento de autorização
// ---------------------------------------------------------------------------

export type PriceChangeInput = {
  product: Product;
  salePrice: string;
  wholesalePrice: string;
  reason: string;
  document?: File | null;
};

/**
 * Registra a troca de preço antes de gravar o produto.
 * Devolve quantos campos mudaram — zero quer dizer que não havia o que anotar.
 */
export async function recordPriceChanges(input: PriceChangeInput): Promise<number> {
  const fields: { field: "salePrice" | "wholesalePrice"; old: string; next: string }[] = [];

  if (!D(input.product.salePrice).equals(D(input.salePrice))) {
    fields.push({ field: "salePrice", old: input.product.salePrice, next: store(input.salePrice) });
  }
  if (!D(input.product.wholesalePrice).equals(D(input.wholesalePrice))) {
    fields.push({
      field: "wholesalePrice",
      old: input.product.wholesalePrice,
      next: store(input.wholesalePrice),
    });
  }
  if (!fields.length) return 0;

  // Um documento só, compartilhado pelas trocas feitas no mesmo salvamento.
  let attachmentId: string | null = null;
  if (input.document) {
    const attachment = await attachFile(
      { entity: "PriceChange", entityId: input.product.id },
      input.document,
      input.reason,
    );
    attachmentId = attachment.id;
  }

  for (const change of fields) {
    await db.priceChanges.add({
      id: newId(),
      productId: input.product.id,
      field: change.field,
      oldValue: change.old,
      newValue: change.next,
      reason: input.reason.trim() || "Sem justificativa informada",
      attachmentId,
      createdAt: nowIso(),
    });
  }

  await registerLog(
    "PRICE", "Produto",
    `Alterou preço de ${input.product.name}: ` +
      fields.map((f) => `${f.field === "salePrice" ? "varejo" : "atacado"} ` +
        `${brl(f.old)} → ${brl(f.next)}`).join(", ") +
      (attachmentId ? " (com documento)" : ""),
    input.product.id,
  );
  return fields.length;
}
