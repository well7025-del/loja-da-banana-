/**
 * DADOS DEMO — Loja da Banana
 *
 * Popula o sistema com movimentações FICTÍCIAS para conhecer o ERP funcionando:
 * dashboard com números, relatórios com gráficos e Central de Decisões com
 * recomendações reais sobre esses dados.
 *
 * ⚠️  NADA AQUI É DADO REAL DA EMPRESA. Todo cliente, fornecedor e lançamento
 *     criado por este script é prefixado com "DADOS DEMO" para que fique
 *     evidente na tela e para que possa ser removido depois:
 *
 *       npm run db:seed:demo           cria os dados de demonstração
 *       npm run db:seed:demo -- --limpar   remove tudo o que este script criou
 *
 * Rode SOMENTE em ambiente de teste, nunca no banco de produção.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { createRequire } from "module";

const require_ = createRequire(import.meta.url);
const serverOnlyPath = require_.resolve("server-only");
require_.cache[serverOnlyPath] = {
  id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {},
  children: [], paths: [],
} as unknown as NodeJS.Module;

const prisma = new PrismaClient();
const PREFIX = "DADOS DEMO";
const D = (v: number | string) => new Prisma.Decimal(v);

async function limpar(companyId: string) {
  console.log("→ Removendo dados de demonstração...");

  const customers = await prisma.customer.findMany({
    where: { companyId, name: { startsWith: PREFIX } }, select: { id: true },
  });
  const suppliers = await prisma.supplier.findMany({
    where: { companyId, name: { startsWith: PREFIX } }, select: { id: true },
  });
  const productions = await prisma.productionOrder.findMany({
    where: { companyId, notes: { startsWith: PREFIX } }, select: { id: true },
  });
  const sales = await prisma.sale.findMany({
    where: { companyId, OR: [{ customerId: { in: customers.map((c) => c.id) } }, { notes: { startsWith: PREFIX } }] },
    select: { id: true },
  });
  const purchases = await prisma.purchaseOrder.findMany({
    where: { companyId, OR: [{ supplierId: { in: suppliers.map((s) => s.id) } }, { notes: { startsWith: PREFIX } }] },
    select: { id: true },
  });

  const customerIds = customers.map((c) => c.id);
  const supplierIds = suppliers.map((s) => s.id);
  const productionIds = productions.map((p) => p.id);
  const saleIds = sales.map((s) => s.id);
  const purchaseIds = purchases.map((p) => p.id);

  // Financeiro
  await prisma.payment.deleteMany({
    where: {
      financeEntry: {
        OR: [
          { saleId: { in: saleIds } }, { purchaseOrderId: { in: purchaseIds } },
          { customerId: { in: customerIds } }, { supplierId: { in: supplierIds } },
        ],
      },
    },
  });
  await prisma.financeEntry.deleteMany({
    where: {
      OR: [
        { saleId: { in: saleIds } }, { purchaseOrderId: { in: purchaseIds } },
        { customerId: { in: customerIds } }, { supplierId: { in: supplierIds } },
      ],
    },
  });
  await prisma.expense.deleteMany({ where: { companyId, description: { startsWith: PREFIX } } });

  // Movimentos de estoque das operações demo
  await prisma.inventoryMovement.deleteMany({
    where: {
      companyId,
      OR: [
        { refId: { in: [...saleIds, ...purchaseIds, ...productionIds] } },
        { productionOrderId: { in: productionIds } },
        { note: { contains: PREFIX } },
      ],
    },
  });

  // Produção e lotes
  await prisma.inventoryMovement.deleteMany({
    where: { batch: { productionOrderId: { in: productionIds } } },
  });
  await prisma.batch.deleteMany({ where: { productionOrderId: { in: productionIds } } });
  await prisma.productionConsumption.deleteMany({ where: { productionOrderId: { in: productionIds } } });
  await prisma.productionOrder.deleteMany({ where: { id: { in: productionIds } } });

  // Lotes de compra órfãos (sem movimento restante)
  const orphanBatches = await prisma.batch.findMany({
    where: { companyId, origin: "PURCHASE", movements: { none: {} } },
    select: { id: true },
  });
  await prisma.batch.deleteMany({ where: { id: { in: orphanBatches.map((b) => b.id) } } });

  // Vendas, compras e cadastros
  await prisma.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
  await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
  await prisma.purchaseItem.deleteMany({ where: { purchaseOrderId: { in: purchaseIds } } });
  await prisma.purchaseOrder.deleteMany({ where: { id: { in: purchaseIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  await prisma.supplier.deleteMany({ where: { id: { in: supplierIds } } });

  // Fichas técnicas de demonstração
  await prisma.recipe.deleteMany({ where: { companyId, name: { contains: "receita de demonstração" } } });

  await recomputeInventory(companyId);
  console.log("✅ Dados de demonstração removidos e saldos recalculados.");
}

/**
 * Recalcula os saldos a partir dos movimentos que sobraram.
 * Depois de apagar operações, os saldos precisam refletir apenas o que restou.
 */
async function recomputeInventory(companyId: string) {
  const rows = await prisma.$queryRaw<{ warehouseId: string; productId: string; saldo: Prisma.Decimal }[]>`
    SELECT "warehouseId", "productId",
           COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE -quantity END), 0) AS saldo
    FROM inventory_movements
    WHERE "companyId" = ${companyId} AND type <> 'ADJUST'
    GROUP BY "warehouseId", "productId"
  `;
  const saldos = new Map(rows.map((r) => [`${r.warehouseId}:${r.productId}`, D(r.saldo.toString())]));

  const balances = await prisma.inventory.findMany({ where: { companyId } });
  for (const balance of balances) {
    const saldo = saldos.get(`${balance.warehouseId}:${balance.productId}`) ?? D(0);
    await prisma.inventory.update({
      where: { id: balance.id },
      data: { quantity: saldo.lessThan(0) ? D(0) : saldo, reserved: D(0) },
    });
  }

  // Zera o custo médio de itens que ficaram sem nenhuma entrada
  const semMovimento = await prisma.product.findMany({
    where: { companyId, movements: { none: { type: "IN" } } },
    select: { id: true },
  });
  await prisma.product.updateMany({
    where: { id: { in: semMovimento.map((p) => p.id) } },
    data: { avgCost: 0, lastCost: 0 },
  });
}

async function main() {
  const company = await prisma.company.findFirstOrThrow({ where: { isDefault: true } });
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { companyId: company.id, isDefault: true } });
  const admin = await prisma.user.findFirstOrThrow({ where: { companyId: company.id }, include: { role: true } });

  if (process.argv.includes("--limpar")) {
    await limpar(company.id);
    return;
  }

  const user = {
    id: admin.id, name: admin.name, email: admin.email, companyId: company.id,
    companyName: company.name, roleSlug: admin.role.slug, roleName: admin.role.name,
    permissions: admin.role.permissions,
  };

  const { createPurchaseOrder } = await import("../src/server/services/purchases");
  const { createSale } = await import("../src/server/services/sales");
  const { createProductionOrder, finishProduction } = await import("../src/server/services/production");

  const bySku = async (sku: string) =>
    prisma.product.findFirstOrThrow({ where: { companyId: company.id, sku } });

  const [bananaVerde, oleo, sal, emb100, chips, passa] = await Promise.all([
    bySku("MP-001"), bySku("MP-005"), bySku("MP-009"), bySku("EM-001"),
    bySku("PA-001"), bySku("PA-002"),
  ]);

  console.log("→ Criando fornecedor e clientes DEMO...");
  const supplier = await prisma.supplier.upsert({
    where: { id: (await prisma.supplier.findFirst({ where: { companyId: company.id, name: `${PREFIX} — Sítio Boa Banana` } }))?.id ?? "novo" },
    update: {},
    create: {
      companyId: company.id, name: `${PREFIX} — Sítio Boa Banana`,
      city: "Demonstração", suppliedItems: "Banana verde e madura", avgLeadTimeDays: 3,
    },
  }).catch(() =>
    prisma.supplier.create({
      data: {
        companyId: company.id, name: `${PREFIX} — Sítio Boa Banana`,
        city: "Demonstração", suppliedItems: "Banana verde e madura", avgLeadTimeDays: 3,
      },
    }),
  );

  const customers = [];
  for (const [name, type] of [
    ["Mercado Central", "MARKET"], ["Empório Natural", "STORE"], ["Distribuidora Norte", "DISTRIBUTOR"],
  ] as const) {
    const full = `${PREFIX} — ${name}`;
    const existing = await prisma.customer.findFirst({ where: { companyId: company.id, name: full } });
    customers.push(existing ?? await prisma.customer.create({
      data: { companyId: company.id, name: full, type, creditLimit: 8000, city: "Demonstração" },
    }));
  }

  console.log("→ Registrando compras DEMO (custo médio será calculado)...");
  await createPurchaseOrder(user, {
    supplierId: supplier.id, warehouseId: warehouse.id, receiveNow: true,
    dueDate: new Date().toISOString(),
    items: [
      { productId: bananaVerde.id, quantity: 400, unitPrice: 4.2 },
      { productId: oleo.id, quantity: 60, unitPrice: 28 },
      { productId: sal.id, quantity: 20, unitPrice: 3.5 },
      { productId: emb100.id, quantity: 3000, unitPrice: 0.42 },
    ],
    notes: `${PREFIX} — compra de demonstração`,
  });
  await createPurchaseOrder(user, {
    supplierId: supplier.id, warehouseId: warehouse.id, receiveNow: true,
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    items: [{ productId: bananaVerde.id, quantity: 300, unitPrice: 5.1 }],
    notes: `${PREFIX} — segunda compra, para variar o custo médio`,
  });

  console.log("→ Criando fichas técnicas DEMO...");
  for (const [product, yieldQty, items] of [
    [chips, 30, [
      { productId: bananaVerde.id, quantity: 100, unit: "KG" as const, isMain: true },
      { productId: oleo.id, quantity: 4, unit: "L" as const, isMain: false },
      { productId: sal.id, quantity: 0.5, unit: "KG" as const, isMain: false },
      { productId: emb100.id, quantity: 300, unit: "UN" as const, isMain: false },
    ]],
    [passa, 25, [
      { productId: bananaVerde.id, quantity: 100, unit: "KG" as const, isMain: true },
      { productId: emb100.id, quantity: 250, unit: "UN" as const, isMain: false },
    ]],
  ] as const) {
    const existing = await prisma.recipe.findUnique({ where: { productId: product.id } });
    if (existing) continue;
    await prisma.recipe.create({
      data: {
        companyId: company.id, productId: product.id,
        name: `${product.name} — receita de demonstração`,
        yieldQty, laborCost: 60, energyCost: 25, otherCost: 5,
        items: { create: items.map((i, index) => ({ ...i, lossPct: 0, sortOrder: index })) },
      },
    });
  }

  console.log("→ Registrando produções DEMO...");
  for (const [product, planned, produced, loss] of [
    [chips, 30, 29, 0.8], [chips, 30, 31, 0.5], [passa, 25, 24, 1.2],
  ] as const) {
    const order = await createProductionOrder(user, {
      productId: product.id, plannedQty: planned, warehouseId: warehouse.id, startNow: true,
      notes: `${PREFIX} — produção de demonstração`,
    });
    await finishProduction(user, { id: order.id, producedQty: produced, lossQty: loss });
  }

  console.log("→ Definindo preços DEMO...");
  await prisma.product.update({
    where: { id: chips.id },
    data: { salePrice: D(56), wholesalePrice: D(46), minStock: D(20), targetMargin: D(30) },
  });
  await prisma.product.update({
    where: { id: passa.id },
    data: { salePrice: D(48), wholesalePrice: D(40), minStock: D(15), targetMargin: D(30) },
  });
  await prisma.product.update({ where: { id: bananaVerde.id }, data: { minStock: D(150) } });
  await prisma.product.update({ where: { id: oleo.id }, data: { minStock: D(20) } });

  console.log("→ Registrando vendas DEMO...");
  const methods = ["PIX", "CASH", "CARD", "TERM"] as const;
  for (let i = 0; i < 12; i++) {
    const customer = customers[i % customers.length];
    const method = methods[i % methods.length];
    const product = i % 3 === 0 ? passa : chips;
    const quantity = [2, 6, 12, 3, 8][i % 5];
    try {
      await createSale(user, {
        customerId: customer.id,
        warehouseId: warehouse.id,
        channel: quantity >= 5 ? "WHOLESALE" : "RETAIL",
        items: [{ productId: product.id, quantity }],
        paymentMethod: method,
        installments: method === "TERM" ? 2 : 1,
        dueDate: method === "TERM" ? new Date(Date.now() + 15 * 86400000).toISOString() : null,
        notes: `${PREFIX} — venda de demonstração`,
      });
    } catch (error) {
      console.log(`   (venda ${i + 1} ignorada: ${(error as Error).message})`);
    }
  }

  console.log("→ Registrando despesas DEMO...");
  const energia = await prisma.financeCategory.findFirst({ where: { name: "Energia" } });
  const exists = await prisma.expense.findFirst({ where: { companyId: company.id, description: { startsWith: PREFIX } } });
  if (!exists) {
    await prisma.expense.createMany({
      data: [
        { companyId: company.id, description: `${PREFIX} — Energia elétrica`, amount: D(680), categoryId: energia?.id, isFixedOverhead: true },
        { companyId: company.id, description: `${PREFIX} — Aluguel do galpão`, amount: D(1500), isFixedOverhead: true },
      ],
    });
  }

  console.log("\n✅ DADOS DEMO criados.");
  console.log("   Todos os clientes, fornecedores e lançamentos aparecem com o prefixo \"DADOS DEMO\".");
  console.log("   Para remover: npm run db:seed:demo -- --limpar\n");
}

main()
  .catch((e) => { console.error("💥", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
