import Dexie, { type Table } from "dexie";
import type {
  Account, Attachment, Batch, Customer, FinanceEntry, Inventory, LogEntry,
  Movement, PriceChange, PriceRule, Product, Production, Recipe, Sale,
  Setting, Statement, StatementLine, Transfer,
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
  attachments!: Table<Attachment, string>;
  priceChanges!: Table<PriceChange, string>;
  inventories!: Table<Inventory, string>;
  accounts!: Table<Account, string>;
  transfers!: Table<Transfer, string>;
  statements!: Table<Statement, string>;
  statementLines!: Table<StatementLine, string>;

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

    // Documentos anexados, auditoria de preço, inventário, contas e extratos.
    this.version(3).stores({
      attachments: "id, [entity+entityId], createdAt",
      priceChanges: "id, productId, createdAt",
      inventories: "id, code, status, startedAt",
      accounts: "id, name, kind, active",
      transfers: "id, fromAccountId, toAccountId, happenedAt, deletedAt",
      statements: "id, accountId, importedAt",
      statementLines: "id, statementId, status, date, fingerprint, amount",
    }).upgrade(async (tx) => {
      // Campos novos com valor neutro. O resto do código já lê com padrão,
      // mas gravar agora evita linhas "meio antigas" nos relatórios.
      await tx.table("products").toCollection().modify((p: Record<string, unknown>) => {
        if (p.commissionPct === undefined) p.commissionPct = "0";
        if (p.qtyDiscounts === undefined) p.qtyDiscounts = [];
      });
      await tx.table("sales").toCollection().modify((s: Record<string, unknown>) => {
        if (s.revision === undefined) s.revision = 1;
      });
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
  "attachments", "priceChanges", "inventories", "accounts", "transfers",
  "statements", "statementLines",
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
