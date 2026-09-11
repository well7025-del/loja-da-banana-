import { db, newId, nowIso } from "@/data/db";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { PriceRule, Product, ProductKind, Unit } from "@/data/types";

/**
 * Estrutura inicial do aplicativo.
 *
 * Cria o catálogo com os produtos e insumos da Loja da Banana e as faixas de
 * desconto do atacado. Preços, custos e saldos nascem ZERADOS: devem ser
 * preenchidos com os números reais da empresa. Nada aqui é inventado.
 */

type CatalogItem = {
  sku: string;
  name: string;
  kind: ProductKind;
  unit: Unit;
  category: string;
  shelfLifeDays?: number;
  trackBatches?: boolean;
};

const CATALOG: CatalogItem[] = [
  { sku: "PA-001", name: "Banana Chips", kind: "FINISHED", unit: "KG", category: "Snacks de banana", shelfLifeDays: 180 },
  { sku: "PA-002", name: "Banana Passa", kind: "FINISHED", unit: "KG", category: "Snacks de banana", shelfLifeDays: 180 },
  { sku: "PA-003", name: "Bananitos de Chocolate", kind: "FINISHED", unit: "KG", category: "Snacks de banana", shelfLifeDays: 120 },
  { sku: "PA-004", name: "Chips de Batata-doce", kind: "FINISHED", unit: "KG", category: "Chips de raízes", shelfLifeDays: 180 },
  { sku: "PA-005", name: "Chips de Macaxeira sabor Churrasco", kind: "FINISHED", unit: "KG", category: "Chips de raízes", shelfLifeDays: 180 },

  { sku: "MP-001", name: "Banana verde", kind: "RAW", unit: "KG", category: "Frutas", shelfLifeDays: 15 },
  { sku: "MP-002", name: "Banana madura", kind: "RAW", unit: "KG", category: "Frutas", shelfLifeDays: 10 },
  { sku: "MP-003", name: "Batata-doce", kind: "RAW", unit: "KG", category: "Raízes", shelfLifeDays: 30 },
  { sku: "MP-004", name: "Macaxeira", kind: "RAW", unit: "KG", category: "Raízes", shelfLifeDays: 20 },
  { sku: "MP-005", name: "Óleo de coco", kind: "RAW", unit: "L", category: "Óleos e gorduras", shelfLifeDays: 365 },
  { sku: "MP-006", name: "Chocolate", kind: "RAW", unit: "KG", category: "Confeitaria", shelfLifeDays: 365 },
  { sku: "MP-007", name: "Açúcar", kind: "RAW", unit: "KG", category: "Ingredientes secos", shelfLifeDays: 730 },
  { sku: "MP-008", name: "Canela", kind: "RAW", unit: "KG", category: "Temperos", shelfLifeDays: 730 },
  { sku: "MP-009", name: "Sal", kind: "RAW", unit: "KG", category: "Temperos", shelfLifeDays: 1095 },
  { sku: "MP-010", name: "Tempero sabor churrasco", kind: "RAW", unit: "KG", category: "Temperos", shelfLifeDays: 365 },

  { sku: "EM-001", name: "Embalagem metalizada 100g", kind: "PACKAGING", unit: "UN", category: "Embalagens", trackBatches: false },
  { sku: "EM-002", name: "Embalagem metalizada 500g", kind: "PACKAGING", unit: "UN", category: "Embalagens", trackBatches: false },
  { sku: "EM-003", name: "Caixa de papelão para transporte", kind: "PACKAGING", unit: "UN", category: "Embalagens", trackBatches: false },
  { sku: "EM-004", name: "Etiqueta adesiva do produto", kind: "PACKAGING", unit: "UN", category: "Embalagens", trackBatches: false },
];

const PRICE_RULES: Omit<PriceRule, "id">[] = [
  { name: "Atacado acima de 5 kg", type: "QTY_DISCOUNT", minQty: "5", minValue: "0", discountPct: "5", channel: "WHOLESALE", customerType: null, productId: null, priority: 1, active: true },
  { name: "Atacado acima de 10 kg", type: "QTY_DISCOUNT", minQty: "10", minValue: "0", discountPct: "10", channel: "WHOLESALE", customerType: null, productId: null, priority: 2, active: true },
  { name: "Atacado acima de 20 kg", type: "QTY_DISCOUNT", minQty: "20", minValue: "0", discountPct: "15", channel: "WHOLESALE", customerType: null, productId: null, priority: 3, active: true },
];

export async function isEmpty(): Promise<boolean> {
  return (await db.products.count()) === 0;
}

/** Roda uma única vez, na primeira abertura do aplicativo. */
export async function seedIfEmpty(): Promise<boolean> {
  if (!(await isEmpty())) return false;

  await db.transaction("rw", [db.products, db.priceRules, db.settings], async () => {
    const now = nowIso();

    await db.products.bulkAdd(
      CATALOG.map<Product>((item) => ({
        id: newId(),
        kind: item.kind,
        sku: item.sku,
        name: item.name,
        barcode: null,
        category: item.category,
        unit: item.unit,
        netWeightKg: null,
        salePrice: "0",
        wholesalePrice: "0",
        avgCost: "0",
        lastCost: "0",
        targetMargin: "0",
        minStock: "0",
        maxStock: null,
        shelfLifeDays: item.shelfLifeDays ?? null,
        trackBatches: item.trackBatches ?? true,
        quantity: "0",
        imageUrl: null,
        notes: "Cadastro inicial — informe preço, custo e estoque mínimo reais.",
        supplierName: null,
        standardLossPct: "0",
        active: true,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      })),
    );

    await db.priceRules.bulkAdd(PRICE_RULES.map((rule) => ({ ...rule, id: newId() })));

    await db.settings.bulkAdd(
      Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })),
    );
  });

  return true;
}

/** Apaga tudo e recria o catálogo inicial. Usado em "recomeçar do zero". */
export async function resetEverything() {
  await db.transaction(
    "rw",
    [db.products, db.batches, db.movements, db.recipes, db.productions,
     db.customers, db.sales, db.finance, db.priceRules, db.settings, db.logs],
    async () => {
      await Promise.all([
        db.products.clear(), db.batches.clear(), db.movements.clear(),
        db.recipes.clear(), db.productions.clear(), db.customers.clear(),
        db.sales.clear(), db.finance.clear(), db.priceRules.clear(),
        db.settings.clear(), db.logs.clear(),
      ]);
    },
  );
  await seedIfEmpty();
}
