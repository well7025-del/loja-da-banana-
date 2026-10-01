import { db, newId, nowIso, registerLog } from "@/data/db";
import type {
  Customer, FinanceEntry, PaymentMethod, Product, Sale, SaleChannel, SaleItem,
} from "@/data/types";
import { D, HUNDRED, ZERO, money, pct, qty, store } from "@/lib/money";
import { brl } from "@/lib/format";
import { BusinessError, nextCode } from "./codes";
import { basePrice, bestLineDiscount, commissionPctOf, resolveOrderDiscount } from "./pricing";
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
  commissionPct: Decimal;
  commissionValue: Decimal;
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
  commissionTotal: Decimal;
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

    const customerDefault = customer ? D(customer.defaultDiscountPct) : ZERO;
    const auto = bestLineDiscount(
      rules,
      product,
      { productId: product.id, quantity, customerType: customer?.type ?? null, channel },
      customerDefault,
    );
    const manual = item.discountPct !== undefined && item.discountPct !== ""
      ? pct(item.discountPct)
      : null;
    const discountPct = manual ?? auto.discountPct;

    const discount = money(gross.times(discountPct).dividedBy(HUNDRED));
    const total = money(gross.minus(discount));
    const unitCost = D(product.avgCost);
    const lineCost = money(quantity.times(unitCost));

    // A comissão vigente é congelada aqui e copiada para o item da venda.
    const commissionPct = commissionPctOf(product);
    const commissionValue = money(total.times(commissionPct).dividedBy(HUNDRED));

    subtotal = subtotal.plus(gross);
    lineDiscount = lineDiscount.plus(discount);
    costTotal = costTotal.plus(lineCost);

    return {
      product, quantity, unitPrice, gross, discountPct, discount, total,
      unitCost, totalCost: lineCost,
      appliedRule: manual ? null : auto.label,
      commissionPct, commissionValue,
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
    commissionTotal: money(lines.reduce((acc, line) => acc.plus(line.commissionValue), ZERO)),
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
  /** Usados só pela alteração de venda, para manter o mesmo número. */
  keepNumber?: string;
  revision?: number;
  replacesSaleId?: string | null;
}): Promise<Sale> {
  if (!input.items?.length) throw new BusinessError("Adicione ao menos um produto à venda.");
  if (input.paymentMethod === "TERM") {
    throw new BusinessError(
      "A venda a prazo não é mais usada. Escolha Pix, dinheiro, cartão ou transferência.",
    );
  }

  const settings = await getSettings();
  const allowNegative = settings.allowNegativeStock === "true";
  const quote = await quoteSale(input);

  return db.transaction(
    "rw",
    [db.sales, db.products, db.batches, db.movements, db.finance, db.priceRules, db.customers, db.logs],
    async () => {
      const number = input.keepNumber ?? (await nextCode("sale"));
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
          commissionPct: store(line.commissionPct),
          commissionValue: store(line.commissionValue),
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
        revision: input.revision ?? 1,
        replacesSaleId: input.replacesSaleId ?? null,
        replacedBySaleId: null,
      };
      await db.sales.add(sale);
      await createReceivables(sale);

      await registerLog(
        input.replacesSaleId ? "UPDATE" : "CREATE", "Venda",
        `Venda ${number}${input.revision && input.revision > 1 ? ` (versão ${input.revision})` : ""}` +
          ` — ${brl(quote.total)} (${input.paymentMethod})`,
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

/**
 * Tabelas tocadas por qualquer operação de venda.
 *
 * `settings` precisa estar aqui porque a alteração de venda chama createSale
 * de dentro desta transação, e createSale lê os parâmetros da empresa. Dexie
 * só deixa acessar as tabelas declaradas no escopo: faltando uma, a operação
 * inteira falha com "object store was not found".
 */
const SALE_TABLES = () => [
  db.sales, db.products, db.batches, db.movements, db.finance,
  db.priceRules, db.customers, db.settings, db.logs,
];

/**
 * Desfaz o efeito de uma venda: devolve o estoque ao lote de origem e
 * cancela os títulos que ainda estiverem abertos.
 *
 * O custo médio não é recalculado na volta — a devolução entra pelo mesmo
 * custo que saiu, senão uma venda ida e volta mexeria no custo do produto.
 */
async function reverseSale(sale: Sale, note: string) {
  for (const item of sale.items) {
    await registerEntry({
      productId: item.productId,
      quantity: item.quantity,
      unitCost: item.unitCost,
      reason: "RETURN_IN",
      batchId: item.batchId,
      refType: "Sale",
      refId: sale.id,
      note,
      updateAvgCost: false,
    });
  }

  const entries = await db.finance.where("saleId").equals(sale.id).toArray();
  for (const entry of entries) {
    if (entry.status === "OPEN" || entry.status === "PARTIAL" || entry.status === "PAID") {
      await db.finance.update(entry.id, { status: "CANCELLED" });
    }
  }
}

/** Cancela a venda: devolve o estoque e cancela os títulos. */
export async function cancelSale(saleId: string, reason: string) {
  return db.transaction("rw", SALE_TABLES(), async () => {
    const sale = await db.sales.get(saleId);
    if (!sale) throw new BusinessError("Venda não encontrada.");
    if (sale.status === "CANCELLED") throw new BusinessError("Venda já cancelada.");

    await reverseSale(sale, `Cancelamento da venda ${sale.number}`);
    await db.sales.update(sale.id, {
      status: "CANCELLED",
      cancelledAt: nowIso(),
      cancelReason: reason,
    });
    await registerLog("CANCEL", "Venda", `Cancelou a venda ${sale.number}: ${reason}`, sale.id);
  });
}

/**
 * ALTERA uma venda já registrada.
 *
 * Em vez de reescrever o registro — o que apagaria o rastro de estoque e de
 * financeiro —, a versão anterior é estornada e marcada como cancelada, e
 * nasce uma nova versão com o MESMO número. O histórico mostra as duas, e os
 * relatórios de auditoria conseguem explicar a diferença.
 */
export async function updateSale(
  saleId: string,
  input: {
    customerId?: string | null;
    channel?: SaleChannel;
    items: SaleLineInput[];
    paymentMethod: PaymentMethod;
    freight?: string | number;
    extraDiscount?: string | number;
    notes?: string;
  },
  reason: string,
): Promise<Sale> {
  if (!reason.trim()) throw new BusinessError("Explique o motivo da alteração.");

  return db.transaction("rw", SALE_TABLES(), async () => {
    const original = await db.sales.get(saleId);
    if (!original) throw new BusinessError("Venda não encontrada.");
    if (original.status === "CANCELLED") {
      throw new BusinessError("Esta venda está cancelada e não pode ser alterada.");
    }
    if (original.replacedBySaleId) {
      throw new BusinessError("Esta versão já foi substituída por outra. Abra a versão mais recente.");
    }

    await reverseSale(original, `Alteração da venda ${original.number}`);
    await db.sales.update(original.id, {
      status: "CANCELLED",
      cancelledAt: nowIso(),
      cancelReason: `Alterada: ${reason}`,
    });

    const replacement = await createSale({
      ...input,
      keepNumber: original.number,
      revision: (original.revision ?? 1) + 1,
      replacesSaleId: original.id,
    });

    await db.sales.update(original.id, { replacedBySaleId: replacement.id });
    await registerLog(
      "UPDATE", "Venda",
      `Alterou a venda ${original.number} (versão ${replacement.revision}): ${reason}`,
      replacement.id,
    );
    return replacement;
  });
}
