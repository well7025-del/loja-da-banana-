/**
 * Teste ponta a ponta das regras de negócio do ERP.
 * Roda em um banco isolado (loja_da_banana_test) para não tocar nos dados reais.
 *
 *   npm run verify
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { createRequire } from "module";

// "server-only" existe para proteger o bundle do navegador; fora do Next ele
// lança erro. Neutralizamos o módulo antes de carregar os serviços.
const require_ = createRequire(import.meta.url);
const serverOnlyPath = require_.resolve("server-only");
require_.cache[serverOnlyPath] = {
  id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {},
  children: [], paths: [],
} as unknown as NodeJS.Module;

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = String(actual);
  const e = String(expected);
  if (a === e) {
    passed++;
    console.log(`  ✅ ${label}: ${a}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}: esperado ${e}, obtido ${a}`);
  }
}

function checkTrue(label: string, condition: boolean, detail = "") {
  if (condition) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label} ${detail}`); }
}

async function main() {
  const { registerEntry, registerExit, registerAdjustment, transferStock } = await import("../src/server/services/inventory");
  const { computeRecipeCost, computePrice } = await import("../src/server/services/costing");
  const { createProductionOrder, finishProduction, explodeRecipe } = await import("../src/server/services/production");
  const { createSale, quoteSale, cancelSale } = await import("../src/server/services/sales");
  const { createPurchaseOrder } = await import("../src/server/services/purchases");
  const { registerPayment, financeSummary } = await import("../src/server/services/finance");
  const { resolveLineDiscount, loadPriceRules } = await import("../src/server/services/pricing");
  const { getInsights } = await import("../src/server/services/decisions");

  const company = await prisma.company.findFirstOrThrow({ where: { isDefault: true } });
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { companyId: company.id, isDefault: true } });
  const admin = await prisma.user.findFirstOrThrow({ where: { companyId: company.id }, include: { role: true } });
  const user = {
    id: admin.id, name: admin.name, email: admin.email, companyId: company.id,
    companyName: company.name, roleSlug: admin.role.slug, roleName: admin.role.name,
    permissions: admin.role.permissions,
  };

  const banana = await prisma.product.findFirstOrThrow({ where: { companyId: company.id, sku: "MP-001" } });
  const oleo = await prisma.product.findFirstOrThrow({ where: { companyId: company.id, sku: "MP-005" } });
  const sal = await prisma.product.findFirstOrThrow({ where: { companyId: company.id, sku: "MP-009" } });
  const emb = await prisma.product.findFirstOrThrow({ where: { companyId: company.id, sku: "EM-001" } });
  const chips = await prisma.product.findFirstOrThrow({ where: { companyId: company.id, sku: "PA-001" } });

  // ============ 1. CUSTO MÉDIO PONDERADO ============
  console.log("\n1) Custo médio ponderado (100 kg a R$4 + 100 kg a R$5 = R$4,50)");
  await prisma.$transaction(async (tx) => {
    await registerEntry(tx, {
      companyId: company.id, warehouseId: warehouse.id, productId: banana.id,
      quantity: 100, unitCost: 4, reason: "PURCHASE", userId: user.id,
    });
  });
  let b = await prisma.product.findUniqueOrThrow({ where: { id: banana.id } });
  check("custo médio após 1ª compra", new Prisma.Decimal(b.avgCost).toFixed(2), "4.00");

  await prisma.$transaction(async (tx) => {
    await registerEntry(tx, {
      companyId: company.id, warehouseId: warehouse.id, productId: banana.id,
      quantity: 100, unitCost: 5, reason: "PURCHASE", userId: user.id,
    });
  });
  b = await prisma.product.findUniqueOrThrow({ where: { id: banana.id } });
  check("custo médio após 2ª compra", new Prisma.Decimal(b.avgCost).toFixed(2), "4.50");

  const invBanana = await prisma.inventory.findFirstOrThrow({ where: { productId: banana.id } });
  check("saldo de banana verde", new Prisma.Decimal(invBanana.quantity).toFixed(0), "200");

  // insumos auxiliares
  await prisma.$transaction(async (tx) => {
    await registerEntry(tx, { companyId: company.id, warehouseId: warehouse.id, productId: oleo.id, quantity: 50, unitCost: 30, reason: "PURCHASE", userId: user.id });
    await registerEntry(tx, { companyId: company.id, warehouseId: warehouse.id, productId: sal.id, quantity: 10, unitCost: 3, reason: "PURCHASE", userId: user.id });
    await registerEntry(tx, { companyId: company.id, warehouseId: warehouse.id, productId: emb.id, quantity: 1000, unitCost: 0.45, reason: "PURCHASE", userId: user.id });
  });

  // ============ 2. FICHA TÉCNICA ============
  console.log("\n2) Ficha técnica: 100 kg de banana → 30 kg de chips");
  const recipe = await prisma.recipe.upsert({
    where: { productId: chips.id },
    update: {},
    create: {
      companyId: company.id, productId: chips.id, name: "Banana Chips — receita padrão",
      yieldQty: 30, expectedLossPct: 0, laborCost: 60, energyCost: 25, otherCost: 5,
      items: {
        create: [
          { productId: banana.id, quantity: 100, unit: "KG", lossPct: 0, sortOrder: 1, isMain: true },
          { productId: oleo.id, quantity: 4, unit: "L", lossPct: 0, sortOrder: 2 },
          { productId: sal.id, quantity: 0.5, unit: "KG", lossPct: 0, sortOrder: 3 },
          { productId: emb.id, quantity: 300, unit: "UN", lossPct: 0, sortOrder: 4 },
        ],
      },
    },
    include: { items: { include: { product: true } }, product: true },
  });
  const full = await prisma.recipe.findUniqueOrThrow({
    where: { id: recipe.id },
    include: { items: { include: { product: true } }, product: true },
  });
  const cost = computeRecipeCost(full);
  // 100*4,50 + 4*30 + 0,5*3 + 300*0,45 = 450 + 120 + 1,5 + 135 = 706,50
  check("custo de matéria-prima", cost.materialCost.toFixed(2), "571.50");
  check("custo de embalagem", cost.packagingCost.toFixed(2), "135.00");
  check("custos indiretos", cost.overheadCost.toFixed(2), "90.00");
  check("custo total da receita", cost.totalCost.toFixed(2), "796.50");
  check("custo por kg", cost.costPerUnit.toFixed(2), "26.55");

  // ============ 3. FORMAÇÃO DE PREÇO ============
  console.log("\n3) Formação de preço (custo 26,55 + 6% imposto + 10% fixo + 3% cartão + 30% margem)");
  const price = computePrice({
    unitCost: cost.costPerUnit, taxPct: 6, fixedOverheadPct: 10, cardFeePct: 3, targetMarginPct: 30,
  });
  // divisor = 1 - 0,49 = 0,51 → 26,55 / 0,51 = 52,06
  check("preço recomendado", price.recommendedPrice.toFixed(2), "52.06");
  check("preço mínimo (margem 0) = 26,55 / 0,81", price.minimumPrice.toFixed(2), "32.78");
  checkTrue("margem recomendada ≈ 30%", Math.abs(price.marginPct.toNumber() - 30) < 0.5, `(${price.marginPct})`);

  await prisma.product.update({
    where: { id: chips.id },
    data: { salePrice: price.recommendedPrice, wholesalePrice: 45, minStock: 20, targetMargin: 30 },
  });

  // ============ 4. PRODUÇÃO ============
  console.log("\n4) Produção de 30 kg de Banana Chips");
  const explosion = await explodeRecipe(chips.id, 30);
  check("banana necessária para 30 kg", explosion!.requirements[0].requiredQty.toFixed(0), "100");
  checkTrue("sem falta de insumo", !explosion!.hasShortage);

  const order = await createProductionOrder(user, {
    productId: chips.id, plannedQty: 30, warehouseId: warehouse.id, startNow: true,
  });
  checkTrue("ordem criada com código OP-", order.code.startsWith("OP-"), order.code);

  const result = await finishProduction(user, { id: order.id, producedQty: 30, lossQty: 1.5 });
  check("lote gerado no formato LB-AAAAMMDD-000", /^LB-\d{8}-\d{3}$/.test(result.batch.code), "true");
  check("custo total real da produção", result.totalCost.toFixed(2), "796.50");
  check("custo unitário real", result.unitCost.toFixed(2), "26.55");
  check("rendimento real (30/100)", result.actualYieldPct!.toFixed(0), "30");

  const bananaAfter = await prisma.inventory.findFirstOrThrow({ where: { productId: banana.id } });
  check("banana baixada do estoque (200-100)", new Prisma.Decimal(bananaAfter.quantity).toFixed(0), "100");
  const chipsStock = await prisma.inventory.findFirstOrThrow({ where: { productId: chips.id } });
  check("chips em estoque", new Prisma.Decimal(chipsStock.quantity).toFixed(0), "30");
  const batch = await prisma.batch.findUniqueOrThrow({ where: { id: result.batch.id } });
  check("lote com quantidade disponível", new Prisma.Decimal(batch.availableQty).toFixed(0), "30");
  checkTrue("lote com validade calculada", batch.expiresAt !== null);

  // ============ 5. REGRAS DE DESCONTO ============
  console.log("\n5) Política de desconto do atacado (configurável)");
  const rules = await loadPriceRules(company.id);
  check("desconto para 6 kg", resolveLineDiscount(rules, { productId: chips.id, quantity: new Prisma.Decimal(6), channel: "WHOLESALE" }).discountPct.toFixed(0), "5");
  check("desconto para 12 kg", resolveLineDiscount(rules, { productId: chips.id, quantity: new Prisma.Decimal(12), channel: "WHOLESALE" }).discountPct.toFixed(0), "10");
  check("desconto para 25 kg", resolveLineDiscount(rules, { productId: chips.id, quantity: new Prisma.Decimal(25), channel: "WHOLESALE" }).discountPct.toFixed(0), "15");
  check("sem desconto no varejo", resolveLineDiscount(rules, { productId: chips.id, quantity: new Prisma.Decimal(25), channel: "RETAIL" }).discountPct.toFixed(0), "0");

  // ============ 6. VENDA ============
  console.log("\n6) Venda no atacado de 10 kg a R$45 com 10% de desconto automático");
  const customer = await prisma.customer.create({
    data: { companyId: company.id, name: "DADOS DEMO — Mercado Teste", type: "MARKET", creditLimit: 5000 },
  });
  const quote = await quoteSale(company.id, {
    customerId: customer.id, channel: "WHOLESALE",
    items: [{ productId: chips.id, quantity: 10 }],
  });
  check("preço unitário de atacado", quote.lines[0].unitPrice.toFixed(2), "45.00");
  check("desconto aplicado", quote.lines[0].discountPct.toFixed(0), "10");
  check("total da venda", quote.total.toFixed(2), "405.00");
  check("custo da venda (10 × 26,55)", quote.costTotal.toFixed(2), "265.50");

  const sale = await createSale(user, {
    customerId: customer.id, warehouseId: warehouse.id, channel: "WHOLESALE",
    items: [{ productId: chips.id, quantity: 10 }],
    paymentMethod: "TERM", installments: 2, dueDate: new Date().toISOString(),
  });
  checkTrue("venda numerada VD-", sale.number.startsWith("VD-"), sale.number);
  check("lucro bruto da venda", new Prisma.Decimal(sale.grossProfit).toFixed(2), "139.50");
  const stockAfterSale = await prisma.inventory.findFirstOrThrow({ where: { productId: chips.id } });
  check("estoque após a venda (30-10)", new Prisma.Decimal(stockAfterSale.quantity).toFixed(0), "20");
  const batchAfterSale = await prisma.batch.findUniqueOrThrow({ where: { id: result.batch.id } });
  check("lote baixado por FEFO", new Prisma.Decimal(batchAfterSale.availableQty).toFixed(0), "20");

  const receivables = await prisma.financeEntry.findMany({ where: { saleId: sale.id }, orderBy: { installment: "asc" } });
  check("parcelas a receber geradas", receivables.length, 2);
  check("valor da 1ª parcela", new Prisma.Decimal(receivables[0].amount).toFixed(2), "202.50");

  // ============ 7. FINANCEIRO ============
  console.log("\n7) Baixa de recebimento e resumo financeiro");
  await registerPayment(user, { entryId: receivables[0].id, method: "PIX" });
  const paidEntry = await prisma.financeEntry.findUniqueOrThrow({ where: { id: receivables[0].id } });
  check("título quitado", paidEntry.status, "PAID");
  const summary = await financeSummary(company.id);
  check("saldo a receber restante", summary.toReceive.toFixed(2), "202.50");

  // ============ 8. COMPRA COM RECEBIMENTO ============
  console.log("\n8) Compra com recebimento automático e conta a pagar");
  const supplier = await prisma.supplier.create({
    data: { companyId: company.id, name: "DADOS DEMO — Fornecedor Teste" },
  });
  const po = await createPurchaseOrder(user, {
    supplierId: supplier.id, warehouseId: warehouse.id, receiveNow: true,
    items: [{ productId: banana.id, quantity: 100, unitPrice: 6 }],
    dueDate: new Date().toISOString(),
  });
  checkTrue("compra recebida", po.status === "RECEIVED", po.status);
  const bananaFinal = await prisma.product.findUniqueOrThrow({ where: { id: banana.id } });
  // 100 kg a 4,50 + 100 kg a 6,00 = 5,25
  check("custo médio recalculado na compra", new Prisma.Decimal(bananaFinal.avgCost).toFixed(2), "5.25");
  const payable = await prisma.financeEntry.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
  check("conta a pagar gerada", new Prisma.Decimal(payable.amount).toFixed(2), "600.00");

  // ============ 9. ESTOQUE INSUFICIENTE ============
  console.log("\n9) Bloqueio de venda sem estoque");
  let blocked = false;
  try {
    await createSale(user, {
      warehouseId: warehouse.id, items: [{ productId: chips.id, quantity: 9999 }], paymentMethod: "PIX",
    });
  } catch (e) {
    blocked = (e as Error).message.includes("Estoque insuficiente");
  }
  checkTrue("venda sem estoque foi bloqueada", blocked);

  // ============ 10. CANCELAMENTO ============
  console.log("\n10) Cancelamento de venda estorna estoque e títulos");
  await cancelSale(user, sale.id, "Teste automatizado");
  const stockAfterCancel = await prisma.inventory.findFirstOrThrow({ where: { productId: chips.id } });
  check("estoque devolvido", new Prisma.Decimal(stockAfterCancel.quantity).toFixed(0), "30");
  const openAfterCancel = await prisma.financeEntry.count({
    where: { saleId: sale.id, status: { in: ["OPEN", "PARTIAL"] } },
  });
  check("títulos em aberto cancelados", openAfterCancel, 0);

  // ============ 11. AJUSTE DE INVENTÁRIO ============
  console.log("\n11) Ajuste de inventário");
  await prisma.$transaction(async (tx) => {
    await registerAdjustment(tx, {
      companyId: company.id, warehouseId: warehouse.id, productId: chips.id,
      countedQty: 28, userId: user.id, note: "Contagem física",
    });
  });
  const adjusted = await prisma.inventory.findFirstOrThrow({ where: { productId: chips.id } });
  check("saldo ajustado para a contagem", new Prisma.Decimal(adjusted.quantity).toFixed(0), "28");

  // ============ 11b. TRANSFERÊNCIA ENTRE LOCAIS ============
  console.log("\n11b) Transferência entre locais mantém o lote rastreável");
  const loja = await prisma.warehouse.findFirstOrThrow({
    where: { companyId: company.id, isDefault: false },
  });
  await prisma.$transaction(async (tx) => {
    await transferStock(tx, {
      companyId: company.id,
      fromWarehouseId: warehouse.id,
      toWarehouseId: loja.id,
      productId: chips.id,
      quantity: 8,
      userId: user.id,
    });
  });
  const naFabrica = await prisma.inventory.findFirstOrThrow({
    where: { productId: chips.id, warehouseId: warehouse.id },
  });
  const naLoja = await prisma.inventory.findFirstOrThrow({
    where: { productId: chips.id, warehouseId: loja.id },
  });
  check("saldo na fábrica após transferir 8", new Prisma.Decimal(naFabrica.quantity).toFixed(0), "20");
  check("saldo na loja", new Prisma.Decimal(naLoja.quantity).toFixed(0), "8");
  const loteDestino = await prisma.batch.findFirst({
    where: { warehouseId: loja.id, productId: chips.id },
  });
  checkTrue("lote criado no destino, derivado da origem", Boolean(loteDestino?.code.includes("-T")), loteDestino?.code ?? "");
  const custoDepois = await prisma.product.findUniqueOrThrow({ where: { id: chips.id } });
  check("custo médio não muda na transferência", new Prisma.Decimal(custoDepois.avgCost).toFixed(2), "26.55");

  // ============ 12. CENTRAL DE DECISÕES ============
  console.log("\n12) Central de Decisões gera recomendações a partir dos dados reais");
  // define um estoque mínimo real para que o motor tenha o que analisar
  await prisma.product.update({ where: { id: banana.id }, data: { minStock: 300 } });
  const insights = await getInsights(company.id);
  checkTrue("recomendações geradas", insights.length > 0, `(${insights.length})`);
  checkTrue(
    "sugestão de compra de matéria-prima em falta",
    insights.some((i) => i.id === `buy-${banana.id}`),
  );
  console.log(insights.slice(0, 4).map((i) => `     ${i.icon} ${i.title}`).join("\n"));

  // ============ 13. AUDITORIA ============
  console.log("\n13) Trilha de auditoria");
  const logs = await prisma.auditLog.count({ where: { companyId: company.id } });
  checkTrue("operações registradas na auditoria", logs > 0, `(${logs})`);

  console.log(`\n${"=".repeat(52)}`);
  console.log(`   ${passed} verificações OK, ${failed} falhas`);
  console.log("=".repeat(52));
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("\n💥", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
