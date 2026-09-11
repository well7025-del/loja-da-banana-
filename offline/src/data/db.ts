import Dexie, { type Table } from "dexie";
import type {
  Batch, Customer, FinanceEntry, LogEntry, Movement, PriceRule,
  Product, Production, Recipe, Sale, Setting,
} from "./types";

/**
 * Banco local do aparelho (IndexedDB).
 * Tudo do ERP mora aqui: nada sai do celular a não ser quando você exporta
 * um backup.
 */
export class LojaDaBananaDB extends Dexie {
  products!: Table<Product, string>;
  batches!: Table<Batch, string>;
  movements!: Table<Movement, string>;
  recipes!: Table<Recipe, string>;
  productions!: Table<Production, string>;
  customers!: Table<Customer, string>;
  sales!: Table<Sale, string>;
  finance!: Table<FinanceEntry, string>;
  priceRules!: Table<PriceRule, string>;
  settings!: Table<Setting, string>;
  logs!: Table<LogEntry, string>;

  constructor() {
    super("loja-da-banana");
    this.version(1).stores({
      products: "id, kind, sku, name, barcode, active, deletedAt",
      batches: "id, productId, code, expiresAt, availableQty",
      movements: "id, productId, batchId, reason, createdAt, [refType+refId]",
      recipes: "id, productId, deletedAt",
      productions: "id, code, productId, status, finishedAt",
      customers: "id, name, type, active, deletedAt",
      sales: "id, number, customerId, status, soldAt",
      finance: "id, direction, status, dueDate, customerId, saleId, deletedAt",
      priceRules: "id, active, type",
      settings: "key",
      logs: "id, createdAt, entity",
    });

    // Consultar os lotes de uma ordem de produção exige índice próprio.
    this.version(2).stores({
      batches: "id, productId, code, expiresAt, availableQty, productionId",
    });
  }
}

export const db = new LojaDaBananaDB();

/** Identificador curto e ordenável por tempo. */
export function newId(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

export const nowIso = () => new Date().toISOString();

/** Todas as tabelas, na ordem usada por backup e restauração. */
export const TABLES = [
  "products", "batches", "movements", "recipes", "productions",
  "customers", "sales", "finance", "priceRules", "settings", "logs",
] as const;

export type TableName = (typeof TABLES)[number];

export async function registerLog(
  action: string,
  entity: string,
  summary: string,
  entityId?: string | null,
) {
  await db.logs.add({
    id: newId(),
    action,
    entity,
    entityId: entityId ?? null,
    summary,
    createdAt: nowIso(),
  });
}
