import { db, newId, nowIso, registerLog } from "@/data/db";
import type {
  Customer, FinanceEntry, PaymentMethod, Product, Sale, SaleChannel, SaleItem,
} from "@/data/types";
import { D, HUNDRED, ZERO, money, pct, qty, store } from "@/lib/money";
import { BusinessError, nextCode } from "./codes";
import { basePrice, resolveLineDiscount, resolveOrderDiscount } from "./pricing";
import { registerEntry, registerExit } from "./inventory";
import { getSettings } from "./settings";
import type Decimal from "decimal.js";

export type SaleLineInput = {
  productId: string;
  quantity: string | number;
  unitPrice?: string | number;
  discountPct?: string | number;
};

export type QuoteLine = {
  product: Product;
  quantity: Decimal;
  unitPrice: Decimal;
  gross: Decimal;
  discountPct: Decimal;
  discount: Decimal;
  total: Decimal;
  unitCost: Decimal;
  totalCost: Decimal;
  appliedRule: string | null;
};

export type Quote = {
  lines: QuoteLine[];
  customer: Customer | null;
  subtotal: Decimal;
  lineDiscount: Decimal;
  orderDiscount: Decimal;
  orderRuleName: string | null;
  extraDiscount: Decimal;
  freight: Decimal;
  discount: Decimal;
  total: Decimal;
  costTotal: Decimal;
  grossProfit: Decimal;
  marginPct: Decimal;
};

/** Cálculo da venda antes de confirmar — o mesmo usado ao gravar. */
export async function quoteSale(input: {
  customerId?: string | null;
  channel?: SaleChannel;
  items: SaleLineInput[];
  freight?: string | number;
  extraDiscount?: string | number;
}): Promise<Quote> {
  const channel = input.channel ?? "RETAIL";
  const [rules, customer, products] = await Promise.all([
    db.priceRules.toArray(),
    input.customerId ? db.customers.get(input.customerId) : Promise.resolve(undefined),
    db.products.bulkGet(input.items.map((i) => i.productId)),
  ]);

  const byId = new Map(
    products.filter((p): p is Product => Boolean(p)).map((p) => [p.id, p]),
  );

  let subtotal = ZERO;
  let lineDiscount = ZERO;
  let costTotal = ZERO;

  const lines: QuoteLine[] = input.items.map((item) => {
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
    const discountPct = manual ??
      pct(auto.discountPct.greaterThan(customerDefault) ? auto.discountPct : customerDefault);

    const discount = money(gross.times(discountPct).dividedBy(HUNDRED));
    const total = money(gross.minus(discount));
    const unitCost = D(product.avgCost);
    const lineCost = money(quantity.times(unitCost));

    subtotal = subtotal.plus(gross);
    lineDiscount = lineDiscount.plus(discount);
    costTotal = costTotal.plus(lineCost);

    return {
      product, quantity, unitPrice, gross, discountPct, discount, total,
      unitCost, totalCost: lineCost,
      appliedRule: manual ? null : auto.rule?.name ?? null,
    };
  });

  const afterLines = money(subtotal.minus(lineDiscount));
  const orderRule = resolveOrderDiscount(rules, afterLines, channel, customer?.type ?? null);
  const orderDiscount = money(afterLines.times(orderRule.discountPct).dividedBy(HUNDRED));
  const extraDiscount = money(input.extraDiscount ?? 0);
  const freight = money(input.freight ?? 0);
  const total = money(afterLines.minus(orderDiscount).minus(extraDiscount).plus(freight));
  const grossProfit = money(total.minus(freight).minus(costTotal));

  return {
    lines,
    customer: customer ?? null,
    subtotal: money(subtotal),
    lineDiscount: money(lineDiscount),
    orderDiscount,
    orderRuleName: orderRule.rule?.name ?? null,
    extraDiscount,
    freight,
    discount: money(lineDiscount.plus(orderDiscount).plus(extraDiscount)),
    total,
    costTotal: money(costTotal),
    grossProfit,
    marginPct: total.greaterThan(0) ? pct(grossProfit.dividedBy(total).times(HUNDRED)) : ZERO,
  };
}

export async function createSale(input: {
  customerId?: string | null;
  channel?: SaleChannel;
  items: SaleLineInput[];
  paymentMethod: PaymentMethod;
  installments?: number;
  dueDate?: string | null;
  freight?: string | number;
  extraDiscount?: string | number;
  notes?: string;
}): Promise<Sale> {
  if (!input.items?.length) throw new BusinessError("Adicione ao menos um produto à venda.");

  const settings = await getSettings();
  const allowNegative = settings.allowNegativeStock === "true";
  const quote = await quoteSale(input);

  // Limite de crédito na venda a prazo
  if (input.paymentMethod === "TERM") {
    if (!input.customerId) throw new BusinessError("Venda a prazo exige um cliente cadastrado.");
    const customer = quote.customer!;
    if (D(customer.creditLimit).greaterThan(0)) {
      const open = (await db.finance.where("customerId").equals(customer.id).toArray())
        .filter((e) => e.direction === "RECEIVABLE" && !e.deletedAt &&
          (e.status === "OPEN" || e.status === "PARTIAL"));
      const outstanding = open.reduce(
        (a, e) => a.plus(D(e.amount).minus(D(e.paidAmount))), ZERO,
      );
      if (outstanding.plus(quote.total).greaterThan(D(customer.creditLimit))) {
        throw new BusinessError(
          `Limite de crédito excedido. Em aberto: R$ ${outstanding.toFixed(2)}, ` +
            `limite: R$ ${D(customer.creditLimit).toFixed(2)}.`,
        );
      }
    }
  }

  return db.transaction(
    "rw",
    [db.sales, db.products, db.batches, db.movements, db.finance, db.priceRules, db.customers, db.logs],
    async () => {
      const number = await nextCode("sale");
      const saleId = newId();
      const items: SaleItem[] = [];
      let costTotal = ZERO;

      for (const line of quote.lines) {
        const exit = await registerExit({
          productId: line.product.id,
          quantity: line.quantity,
          reason: "SALE",
          refType: "Sale",
          refId: saleId,
          note: `Venda ${number}`,
          allowNegative,
        });
        costTotal = costTotal.plus(exit.totalCost);

        items.push({
          productId: line.product.id,
          batchId: exit.movements[0]?.batchId ?? null,
          quantity: store(line.quantity),
          unitPrice: store(line.unitPrice),
          discountPct: store(line.discountPct),
          discount: store(line.discount),
          total: store(line.total),
          unitCost: store(exit.unitCost),
          totalCost: store(exit.totalCost),
        });
      }

      const grossProfit = money(quote.total.minus(quote.freight).minus(costTotal));
      const sale: Sale = {
        id: saleId,
        number,
        customerId: input.customerId ?? null,
        channel: input.channel ?? "RETAIL",
        status: "COMPLETED",
        items,
        subtotal: store(quote.subtotal),
        discount: store(quote.discount),
        freight: store(quote.freight),
        total: store(quote.total),
        costTotal: store(money(costTotal)),
        grossProfit: store(grossProfit),
        marginPct: store(
          quote.total.greaterThan(0) ? pct(grossProfit.dividedBy(quote.total).times(HUNDRED)) : ZERO,
        ),
        paymentMethod: input.paymentMethod,
        installments: Math.max(1, Number(input.installments ?? 1)),
        dueDate: input.dueDate ?? null,
        soldAt: nowIso(),
        notes: input.notes ?? null,
      };
      await db.sales.add(sale);
      await createReceivables(sale);

      await registerLog(
        "CREATE", "Venda",
        `Venda ${number} — R$ ${quote.total.toFixed(2)} (${input.paymentMethod})`,
        saleId,
      );
      return sale;
    },
  );
}

/** Toda venda gera lançamento a receber; à vista já nasce quitado. */
async function createReceivables(sale: Sale) {
  const total = D(sale.total);
  if (total.lessThanOrEqualTo(0)) return;

  const onTerm = sale.paymentMethod === "TERM";
  const count = onTerm ? Math.max(1, sale.installments) : 1;
  const per = money(total.dividedBy(count));

  for (let i = 1; i <= count; i++) {
    const amount = i === count ? money(total.minus(per.times(count - 1))) : per;
    const base = sale.dueDate ? new Date(sale.dueDate) : new Date();
    const due = onTerm
      ? new Date(base.getTime() + (i - 1) * 30 * 86400000).toISOString()
      : nowIso();

    const entry: FinanceEntry = {
      id: newId(),
      direction: "RECEIVABLE",
      status: onTerm ? "OPEN" : "PAID",
      description: `Venda ${sale.number}${count > 1 ? ` — parcela ${i}/${count}` : ""}`,
      category: "Vendas",
      customerId: sale.customerId ?? null,
      saleId: sale.id,
      amount: store(amount),
      paidAmount: onTerm ? "0" : store(amount),
      dueDate: due,
      issuedAt: nowIso(),
      paidAt: onTerm ? null : nowIso(),
      installment: i,
      installments: count,
      payments: onTerm
        ? []
        : [{
            amount: store(amount),
            method: sale.paymentMethod,
            paidAt: nowIso(),
            note: "Recebimento no ato da venda",
          }],
    };
    await db.finance.add(entry);
  }
}

/** Cancela a venda: devolve o estoque e cancela os títulos em aberto. */
export async function cancelSale(saleId: string, reason: string) {
  return db.transaction(
    "rw",
    [db.sales, db.products, db.batches, db.movements, db.finance, db.logs],
    async () => {
      const sale = await db.sales.get(saleId);
      if (!sale) throw new BusinessError("Venda não encontrada.");
      if (sale.status === "CANCELLED") throw new BusinessError("Venda já cancelada.");

      for (const item of sale.items) {
        await registerEntry({
          productId: item.productId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          reason: "RETURN_IN",
          batchId: item.batchId,
          refType: "Sale",
          refId: sale.id,
          note: `Cancelamento da venda ${sale.number}`,
          updateAvgCost: false,
        });
      }

      const entries = await db.finance.where("saleId").equals(sale.id).toArray();
      for (const entry of entries) {
        if (entry.status === "OPEN" || entry.status === "PARTIAL") {
          await db.finance.update(entry.id, { status: "CANCELLED" });
        }
      }

      await db.sales.update(sale.id, {
        status: "CANCELLED",
        cancelledAt: nowIso(),
        cancelReason: reason,
      });
      await registerLog("CANCEL", "Venda", `Cancelou a venda ${sale.number}: ${reason}`, sale.id);
    },
  );
}
