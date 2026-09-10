/**
 * Seed base do ERP Loja da Banana.
 *
 * Cria apenas a ESTRUTURA da operação: empresa, locais de estoque, perfis de
 * acesso, usuário administrador, categorias financeiras, regras de desconto e o
 * catálogo de produtos/insumos citados pela empresa.
 *
 * IMPORTANTE: nenhum valor operacional é inventado. Preços, custos e saldos
 * nascem zerados para serem preenchidos com os números reais da empresa.
 * Dados fictícios ficam no seed separado `prisma/seed-demo.ts`, sempre
 * identificados como "DADOS DEMO".
 */
import { PrismaClient, ProductKind, UnitOfMeasure } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ROLE_PRESETS } from "../src/lib/permissions";
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from "../src/lib/defaults";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@lojadabanana.com.br";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "LojaDaBanana@2026";

type CatalogItem = {
  sku: string;
  name: string;
  kind: ProductKind;
  unit: UnitOfMeasure;
  category: string;
  shelfLifeDays?: number;
  trackBatches?: boolean;
};

const CATALOG: CatalogItem[] = [
  // ---- Produtos acabados ----
  { sku: "PA-001", name: "Banana Chips", kind: "FINISHED", unit: "KG", category: "Snacks de banana", shelfLifeDays: 180 },
  { sku: "PA-002", name: "Banana Passa", kind: "FINISHED", unit: "KG", category: "Snacks de banana", shelfLifeDays: 180 },
  { sku: "PA-003", name: "Bananitos de Chocolate", kind: "FINISHED", unit: "KG", category: "Snacks de banana", shelfLifeDays: 120 },
  { sku: "PA-004", name: "Chips de Batata-doce", kind: "FINISHED", unit: "KG", category: "Chips de raízes", shelfLifeDays: 180 },
  { sku: "PA-005", name: "Chips de Macaxeira sabor Churrasco", kind: "FINISHED", unit: "KG", category: "Chips de raízes", shelfLifeDays: 180 },

  // ---- Matérias-primas ----
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

  // ---- Embalagens ----
  { sku: "EM-001", name: "Embalagem metalizada 100g", kind: "PACKAGING", unit: "UN", category: "Embalagens", trackBatches: false },
  { sku: "EM-002", name: "Embalagem metalizada 500g", kind: "PACKAGING", unit: "UN", category: "Embalagens", trackBatches: false },
  { sku: "EM-003", name: "Caixa de papelão para transporte", kind: "PACKAGING", unit: "UN", category: "Embalagens", trackBatches: false },
  { sku: "EM-004", name: "Etiqueta adesiva do produto", kind: "PACKAGING", unit: "UN", category: "Embalagens", trackBatches: false },
];

async function main() {
  console.log("→ Criando empresa e locais de estoque...");
  const company = await prisma.company.upsert({
    where: { taxId: "00.000.000/0001-00" },
    update: {},
    create: {
      name: "Loja da Banana",
      legalName: "Loja da Banana",
      taxId: "00.000.000/0001-00",
      isDefault: true,
    },
  });

  const warehouses = [
    { code: "FAB", name: "Fábrica", kind: "FACTORY", isDefault: true },
    { code: "LOJA", name: "Loja", kind: "STORE", isDefault: false },
  ];
  for (const w of warehouses) {
    await prisma.warehouse.upsert({
      where: { companyId_code: { companyId: company.id, code: w.code } },
      update: {},
      create: { ...w, companyId: company.id },
    });
  }

  console.log("→ Criando perfis de acesso...");
  for (const [slug, preset] of Object.entries(ROLE_PRESETS)) {
    await prisma.role.upsert({
      where: { slug },
      update: { permissions: preset.permissions, name: preset.name, description: preset.description },
      create: {
        slug, name: preset.name, description: preset.description,
        permissions: preset.permissions, isSystem: true,
      },
    });
  }
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { slug: "ADMIN" } });

  console.log("→ Criando usuário administrador...");
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      companyId: company.id,
      roleId: adminRole.id,
      name: "Administrador",
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 11),
      mustChangePassword: true,
    },
  });

  console.log("→ Criando categorias financeiras...");
  for (const category of DEFAULT_CATEGORIES) {
    await prisma.financeCategory.upsert({
      where: { name: category.name },
      update: {},
      create: { ...category, isSystem: true },
    });
  }

  console.log("→ Gravando parâmetros padrão...");
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { companyId_key: { companyId: company.id, key } },
      update: {},
      create: { companyId: company.id, key, value },
    });
  }

  console.log("→ Criando catálogo de produtos e insumos...");
  for (const item of CATALOG) {
    const category = await prisma.category.upsert({
      where: { companyId_name_kind: { companyId: company.id, name: item.category, kind: item.kind } },
      update: {},
      create: { companyId: company.id, name: item.category, kind: item.kind },
    });

    const product = await prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: item.sku } },
      update: {},
      create: {
        companyId: company.id,
        sku: item.sku,
        name: item.name,
        kind: item.kind,
        unit: item.unit,
        categoryId: category.id,
        shelfLifeDays: item.shelfLifeDays ?? null,
        trackBatches: item.trackBatches ?? true,
        description: "Cadastro inicial — informe preço, custo e estoque mínimo reais.",
      },
    });

    if (item.kind === "RAW" && !(await prisma.rawMaterial.findUnique({ where: { productId: product.id } }))) {
      await prisma.rawMaterial.create({
        data: { productId: product.id, purchaseUnit: item.unit, purchaseFactor: 1 },
      });
    }
  }

  console.log("→ Criando política de desconto do atacado (configurável no painel)...");
  const rules = [
    { name: "Atacado acima de 5 kg", minQty: 5, discountPct: 5, priority: 1 },
    { name: "Atacado acima de 10 kg", minQty: 10, discountPct: 10, priority: 2 },
    { name: "Atacado acima de 20 kg", minQty: 20, discountPct: 15, priority: 3 },
  ];
  for (const rule of rules) {
    const exists = await prisma.priceRule.findFirst({ where: { companyId: company.id, name: rule.name } });
    if (!exists) {
      await prisma.priceRule.create({
        data: { ...rule, companyId: company.id, type: "QTY_DISCOUNT", channel: "WHOLESALE" },
      });
    }
  }

  console.log("\n✅ Seed concluído.");
  console.log(`   Acesso inicial: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log("   O sistema exigirá a troca da senha no primeiro login.\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
