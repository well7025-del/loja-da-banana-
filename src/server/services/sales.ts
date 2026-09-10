import "server-only";
import { Prisma, prisma } from "@/lib/db";
import { D, money, qty, pct, ZERO } from "@/lib/money";
import { nextCode } from "@/lib/codes";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { BusinessError, registerEntry, registerExit } from "./inventory";
import { basePrice, loadPriceRules, resolveLineDiscount, resolveOrderDiscount } from "./pricing";
import { getSettings } from "./settings";
import type { PaymentMethod, SaleChannel } from "@prisma/client";

const HUNDRED = new Prisma.Decimal(100);

export type SaleItemInput = {
  productId: string;
  quantity: string | number;
  unitPrice?: string | number;
  discountPct?: string | number;
  batchId?: string | null;
};

export type CreateSaleInput = {
  customerId?: string | null;
  warehouseId: string;
  channel?: SaleChannel;
  items: SaleItemInput[];
  paymentMethod: PaymentMethod;
  installments?: number;
  dueDate?: string | Date | null;
  freight?: string | number;
  extraDiscount?: string | number;
  notes?: string;
  orderId?: string | null;
};

/** Pré-cálculo da venda (usado na tela antes de confirmar). */
export async function quoteSale(companyId: string, input: Omit<CreateSaleInput, "paymentMethod" | "warehouseId">) {
  const channel = input.channel ?? "RETAIL";
  const [rules, customer] = await Promise.all([
    loadPriceRules(companyId),
    input.customerId
      ? prisma.customer.findFirst({ where: { id: input.customerId, companyId } })
      : Promise.resolve(null),
  ]);

  const products = await prisma.product.findMany({
    where: { companyId, id: { in: input.items.map((i) => i.productId) } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  let subtotal = ZERO;
  let discountTotal = ZERO;
  let costTotal = ZERO;

  const lines = input.items.map((item) => {
    const product = byId.get(item.productId);
    if (!product) throw new BusinessError("Produto da venda não encontrado.");
    const quantity = qty(item.quantity);
    const unitPrice = item.unitPrice !== undefined && item.unitPrice !== ""
      ? money(item.unitPrice)
      : basePrice(product, channel);
    const gross = money(quantity.times(unitPrice));

    const auto = resolveLineDiscount(rules, {
      productId: product.id,
      quantity,
      customerType: customer?.type ?? null,
      channel,
    });
    const manual = item.discountPct !== undefined && item.discountPct !== ""
      ? pct(item.discountPct)
      : null;
    const customerDefault = customer ? D(customer.defaultDiscountPct) : ZERO;
    const discountPct = manual ?? pct(Prisma.Decimal.max(auto.discountPct, customerDefault));
    const discount = money(gross.times(discountPct).dividedBy(HUNDRED));
    const total = money(gross.minus(discount));
    const unitCost = D(product.avgCost);
    const lineCost = money(quantity.times(unitCost));

    subtotal = subtotal.plus(gross);
    discountTotal = discountTotal.plus(discount);
    costTotal = costTotal.plus(lineCost);

    return {
      product, quantity, unitPrice, gross, discountPct, discount, total,
      unitCost, totalCost: lineCost,
      appliedRule: manual ? null : auto.rule?.name ?? null,
      marginPct: total.greaterThan(0) ? pct(total.minus(lineCost).dividedBy(total).times(HUNDRED)) : ZERO,
    };
  });

  const afterLines = money(subtotal.minus(discountTotal));
  const orderRule = resolveOrderDiscount(rules, afterLines, channel, customer?.type ?? null);
  const orderDiscount = money(afterLines.times(orderRule.discountPct).dividedBy(HUNDRED));
  const extraDiscount = money(input.extraDiscount ?? 0);
  const freight = money(input.freight ?? 0);
  const total = money(afterLines.minus(orderDiscount).minus(extraDiscount).plus(freight));
  const grossProfit = money(total.minus(freight).minus(costTotal));

  return {
    lines,
    customer,
    subtotal: money(subtotal),
    lineDiscount: money(discountTotal),
    orderDiscount,
    orderRuleName: orderRule.rule?.name ?? null,
    extraDiscount,
    freight,
    discount: money(discountTotal.plus(orderDiscount).plus(extraDiscount)),
    total,
    costTotal: money(costTotal),
    grossProfit,
    marginPct: total.greaterThan(0) ? pct(grossProfit.dividedBy(total).times(HUNDRED)) : ZERO,
  };
}

export async function createSale(user: SessionUser, input: CreateSaleInput) {
  if (!input.items?.length) throw new BusinessError("Adicione ao menos um produto à venda.");
  const settings = await getSettings(user.companyId);
  const allowNegative = settings.allowNegativeStock === "true";
  const quote = await quoteSale(user.companyId, input);

  // Limite de crédito para venda a prazo
  if (input.paymentMethod === "TERM") {
    if (!input.customerId) throw new BusinessError("Venda a prazo exige um cliente cadastrado.");
    const customer = quote.customer!;
    if (D(customer.creditLimit).greaterThan(0)) {
      const open = await prisma.financeEntry.aggregate({
        where: {
          companyId: user.companyId, customerId: customer.id, direction: "RECEIVABLE",
          status: { in: ["OPEN", "PARTIAL"] }, deletedAt: null,
        },
        _sum: { amount: true, paidAmount: true },
      });
      const outstanding = D(open._sum.amount).minus(D(open._sum.paidAmount));
      if (outstanding.plus(quote.total).greaterThan(D(customer.creditLimit))) {
        throw new BusinessError(
          `Limite de crédito excedido. Em aberto: R$ ${outstanding.toFixed(2)}, limite: R$ ${D(customer.creditLimit).toFixed(2)}.`,
        );
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    const number = await nextCode(tx, "sale", user.companyId);
    const sale = await tx.sale.create({
      data: {
        companyId: user.companyId,
        warehouseId: input.warehouseId,
        number,
        customerId: input.customerId ?? null,
        sellerId: user.id,
        channel: input.channel ?? "RETAIL",
        subtotal: quote.subtotal,
        discount: quote.discount,
        freight: quote.freight,
        total: quote.total,
        paymentMethod: input.paymentMethod,
        installments: Math.max(1, Number(input.installments ?? 1)),
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        notes: input.notes ?? null,
        orderId: input.orderId ?? null,
      },
    });

    let costTotal = ZERO;
    for (const line of quote.lines) {
      const exit = await registerExit(tx, {
        companyId: user.companyId,
        warehouseId: input.warehouseId,
        productId: line.product.id,
        quantity: line.quantity,
        reason: "SALE",
        refType: "Sale",
        refId: sale.id,
        note: `Venda ${number}`,
        userId: user.id,
        allowNegative,
        batchId: input.items.find((i) => i.productId === line.product.id)?.batchId ?? null,
      });
      costTotal = costTotal.plus(exit.totalCost);

      await tx.saleItem.create({
        data: {
          saleId: sale.id,
          productId: line.product.id,
          batchId: exit.movements[0]?.batchId ?? null,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPct: line.discountPct,
          discount: line.discount,
          total: line.total,
          unitCost: exit.unitCost,
          totalCost: exit.totalCost,
        },
      });
    }

    const grossProfit = money(quote.total.minus(quote.freight).minus(costTotal));
    const updated = await tx.sale.update({
      where: { id: sale.id },
      data: {
        costTotal: money(costTotal),
        grossProfit,
        marginPct: quote.total.greaterThan(0)
          ? pct(grossProfit.dividedBy(quote.total).times(HUNDRED))
          : ZERO,
      },
    });

    // Financeiro: toda venda gera lançamento a receber (à vista já quitado)
    await createReceivables(tx, {
      companyId: user.companyId,
      sale: updated,
      customerId: input.customerId ?? null,
      userId: user.id,
    });

    // Baixa a reserva do pedido, se veio de um pedido
    if (input.orderId) {
      await tx.order.update({ where: { id: input.orderId }, data: { status: "DELIVERED" } });
    }

    await audit(
      {
        user, action: "CREATE", entity: "Sale", entityId: sale.id,
        summary: `Venda ${number} — R$ ${quote.total.toFixed(2)} (${input.paymentMethod})`,
        after: { number, total: quote.total.toString(), items: quote.lines.length },
      },
      tx,
    );

    return updated;
  }, { timeout: 20000 });
}

async function createReceivables(
  tx: Prisma.TransactionClient,
  args: {
    companyId: string;
    sale: Prisma.SaleGetPayload<object>;
    customerId: string | null;
    userId: string;
  },
) {
  const { sale } = args;
  const total = D(sale.total);
  if (total.lessThanOrEqualTo(0)) return;

  const category = await tx.financeCategory.findFirst({
    where: { name: "Vendas", direction: "RECEIVABLE" },
  });

  const onTerm = sale.paymentMethod === "TERM";
  const count = onTerm ? Math.max(1, sale.installments) : 1;
  const per = money(total.dividedBy(count));

  for (let i = 1; i <= count; i++) {
    const amount = i === count ? money(total.minus(per.times(count - 1))) : per;
    const due = onTerm
      ? new Date((sale.dueDate ?? new Date()).getTime() + (i - 1) * 30 * 86400000)
      : new Date();

    const entry = await tx.financeEntry.create({
      data: {
        companyId: args.companyId,
        direction: "RECEIVABLE",
        status: onTerm ? "OPEN" : "PAID",
        description: `Venda ${sale.number}${count > 1 ? ` — parcela ${i}/${count}` : ""}`,
        categoryId: category?.id ?? null,
        customerId: args.customerId,
        saleId: sale.id,
        amount,
        paidAmount: onTerm ? 0 : amount,
        paidAt: onTerm ? null : new Date(),
        dueDate: due,
        installment: i,
        installments: count,
      },
    });

    if (!onTerm) {
      await tx.payment.create({
        data: {
          financeEntryId: entry.id,
          amount,
          method: sale.paymentMethod,
          userId: args.userId,
          note: "Recebimento no ato da venda",
        },
      });
    }
  }
}

/** Cancela a venda: devolve o estoque e cancela os títulos em aberto. */
export async function cancelSale(user: SessionUser, saleId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, companyId: user.companyId },
      include: { items: true },
    });
    if (!sale) throw new BusinessError("Venda não encontrada.");
    if (sale.status === "CANCELLED") throw new BusinessError("Venda já cancelada.");

    for (const item of sale.items) {
      await registerEntry(tx, {
        companyId: user.companyId,
        warehouseId: sale.warehouseId,
        productId: item.productId,
        quantity: item.quantity,
        unitCost: item.unitCost,
        reason: "RETURN_IN",
        batchId: item.batchId,
        refType: "Sale",
        refId: sale.id,
        note: `Cancelamento da venda ${sale.number}`,
        userId: user.id,
        updateAvgCost: false,
      });
    }

    await tx.financeEntry.updateMany({
      where: { saleId: sale.id, status: { in: ["OPEN", "PARTIAL"] } },
      data: { status: "CANCELLED" },
    });

    const cancelled = await tx.sale.update({
      where: { id: sale.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });

    await audit(
      { user, action: "CANCEL", entity: "Sale", entityId: sale.id, summary: `Cancelou venda ${sale.number}: ${reason}` },
      tx,
    );
    return cancelled;
  }, { timeout: 20000 });
}
