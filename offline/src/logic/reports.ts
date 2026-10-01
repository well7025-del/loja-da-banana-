import { db } from "@/data/db";
import type { Movement, Product, Sale } from "@/data/types";
import { D, ZERO, money, pct, qty } from "@/lib/money";
import { brl, datetime, date as fmtDate, num } from "@/lib/format";
import {
  INVENTORY_STATUS_LABELS, MOVEMENT_REASON_LABELS,
  PAYMENT_METHOD_LABELS, STATEMENT_LINE_STATUS_LABELS, UNIT_LABELS,
} from "@/lib/defaults";
import { inPeriod, type Period } from "@/lib/period";
import type { ReportSection } from "./documents";
import type Decimal from "decimal.js";

export type ReportId =
  | "vendas" | "resultado" | "comissoes" | "margem" | "kardex" | "ajustes"
  | "precos" | "inventarios" | "conciliacao" | "estoque" | "auditoria";

export type ReportMeta = {
  id: ReportId;
  title: string;
  description: string;
  icon: string;
  /** Relatórios de posição olham o agora, não um intervalo. */
  usesPeriod: boolean;
};

export const REPORTS: ReportMeta[] = [
  { id: "vendas", title: "Vendas do período", icon: "🧾", usesPeriod: true,
    description: "Toda venda emitida, incluindo as canceladas e as alteradas." },
  { id: "resultado", title: "Resultado do período", icon: "📈", usesPeriod: true,
    description: "Faturamento, custo da mercadoria, despesas e lucro." },
  { id: "comissoes", title: "Comissões por produto", icon: "🤝", usesPeriod: true,
    description: "Quanto cada produto gerou de comissão." },
  { id: "margem", title: "Margem por produto", icon: "💹", usesPeriod: true,
    description: "Quanto cada produto vendeu, custou e deixou." },
  { id: "kardex", title: "Movimentações de estoque", icon: "🔁", usesPeriod: true,
    description: "Entradas e saídas item a item, com o saldo depois de cada uma." },
  { id: "ajustes", title: "Ajustes extraordinários", icon: "⚠️", usesPeriod: true,
    description: "Perdas, devoluções, inventários e balanços — e quais têm documento." },
  { id: "precos", title: "Alterações de preço", icon: "🏷️", usesPeriod: true,
    description: "De quanto para quanto, por que e com qual autorização." },
  { id: "inventarios", title: "Inventários", icon: "📋", usesPeriod: true,
    description: "Contagens feitas e a divergência apurada em cada uma." },
  { id: "conciliacao", title: "Conciliação bancária", icon: "🏦", usesPeriod: true,
    description: "O que do extrato já foi conferido e o que ainda falta." },
  { id: "estoque", title: "Posição de estoque", icon: "📦", usesPeriod: false,
    description: "Saldo e valor de cada item neste momento." },
  { id: "auditoria", title: "Trilha de auditoria", icon: "🔎", usesPeriod: true,
    description: "Tudo o que foi feito no aplicativo, em ordem." },
];

export type ReportResult = {
  title: string;
  sections: ReportSection[];
  /** Destaques mostrados em cartões no alto da tela. */
  kpis: { label: string; value: string; tone?: "green" | "red" | "neutral" }[];
};

const unitOf = (p: Product | undefined) => UNIT_LABELS[p?.unit ?? "UN"] ?? "un";
const productName = (p: Product | undefined) => p?.name ?? "Produto removido";

async function productMap(ids: string[]) {
  const rows = await db.products.bulkGet([...new Set(ids)]);
  return new Map(rows.filter((p): p is Product => Boolean(p)).map((p) => [p.id, p]));
}

export async function buildReportData(id: ReportId, period: Period): Promise<ReportResult> {
  switch (id) {
    case "vendas": return salesReport(period);
    case "resultado": return resultReport(period);
    case "comissoes": return commissionReport(period);
    case "margem": return marginReport(period);
    case "kardex": return kardexReport(period);
    case "ajustes": return adjustmentsReport(period);
    case "precos": return priceReport(period);
    case "inventarios": return inventoriesReport(period);
    case "conciliacao": return reconciliationReport(period);
    case "estoque": return stockReport();
    case "auditoria": return auditReport(period);
  }
}

// ---------------------------------------------------------------------------

async function periodSales(period: Period): Promise<Sale[]> {
  return (await db.sales.toArray())
    .filter((sale) => inPeriod(sale.soldAt, period))
    .sort((a, b) => a.soldAt.localeCompare(b.soldAt));
}

async function salesReport(period: Period): Promise<ReportResult> {
  const sales = await periodSales(period);
  const customers = new Map((await db.customers.toArray()).map((c) => [c.id, c.name]));

  const valid = sales.filter((s) => s.status === "COMPLETED");
  const cancelled = sales.filter((s) => s.status === "CANCELLED");
  const revised = sales.filter((s) => (s.revision ?? 1) > 1 && s.status === "COMPLETED");
  const total = sum(valid.map((s) => D(s.total)));

  return {
    title: "Vendas do período",
    kpis: [
      { label: "Vendas válidas", value: String(valid.length) },
      { label: "Faturamento", value: brl(total), tone: "green" },
      { label: "Canceladas", value: String(cancelled.length), tone: cancelled.length ? "red" : "neutral" },
      { label: "Alteradas", value: String(revised.length) },
    ],
    sections: [
      {
        title: "Vendas emitidas",
        note: "Vendas canceladas e versões substituídas aparecem na lista de propósito: " +
          "é o que permite explicar a diferença entre o que foi emitido e o que valeu.",
        columns: [
          { title: "Número", width: 1.2 },
          { title: "Data", width: 1.1 },
          { title: "Cliente", width: 1.6 },
          { title: "Pagamento", width: 1 },
          { title: "Situação", width: 1.2 },
          { title: "Total", width: 1, align: "right" },
        ],
        rows: sales.map((sale) => [
          sale.number + ((sale.revision ?? 1) > 1 ? ` v${sale.revision}` : ""),
          fmtDate(sale.soldAt),
          sale.customerId ? customers.get(sale.customerId) ?? "—" : "Balcão",
          PAYMENT_METHOD_LABELS[sale.paymentMethod] ?? sale.paymentMethod,
          sale.status === "CANCELLED"
            ? (sale.replacedBySaleId ? "Substituída" : "Cancelada")
            : "Válida",
          brl(sale.total),
        ]),
        totals: [
          ["Faturamento válido", brl(total)],
          ["Valor cancelado", brl(sum(cancelled.map((s) => D(s.total))))],
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------

async function resultReport(period: Period): Promise<ReportResult> {
  const sales = (await periodSales(period)).filter((s) => s.status === "COMPLETED");
  const revenue = sum(sales.map((s) => D(s.total)));
  const freight = sum(sales.map((s) => D(s.freight)));
  const cogs = sum(sales.map((s) => D(s.costTotal)));
  const commission = sum(
    sales.flatMap((s) => s.items.map((i) => D(i.commissionValue ?? 0))),
  );
  const grossProfit = money(revenue.minus(freight).minus(cogs));

  const entries = (await db.finance.toArray()).filter(
    (e) => !e.deletedAt && e.direction === "PAYABLE" && e.status !== "CANCELLED",
  );
  const byCategory = new Map<string, Decimal>();
  let expenses = ZERO;

  for (const entry of entries) {
    for (const payment of entry.payments) {
      if (!inPeriod(payment.paidAt, period)) continue;
      const key = entry.category ?? "Outros";
      byCategory.set(key, (byCategory.get(key) ?? ZERO).plus(D(payment.amount)));
      expenses = expenses.plus(D(payment.amount));
    }
  }

  const net = money(grossProfit.minus(expenses));

  return {
    title: "Resultado do período",
    kpis: [
      { label: "Faturamento", value: brl(revenue), tone: "green" },
      { label: "Custo da mercadoria", value: brl(cogs) },
      { label: "Lucro bruto", value: brl(grossProfit), tone: "green" },
      { label: "Resultado", value: brl(net), tone: net.greaterThanOrEqualTo(0) ? "green" : "red" },
    ],
    sections: [
      {
        title: "Da venda ao lucro bruto",
        pairs: [
          ["Faturamento", brl(revenue)],
          ["(-) Frete cobrado", brl(freight)],
          ["(-) Custo da mercadoria vendida", brl(cogs)],
          ["(=) Lucro bruto", brl(grossProfit)],
          ["Margem bruta", revenue.greaterThan(0)
            ? `${num(pct(grossProfit.dividedBy(revenue).times(100)), 1)}%` : "—"],
          ["Comissões geradas", brl(commission)],
        ],
      },
      {
        title: "Despesas pagas no período",
        columns: [{ title: "Categoria", width: 3 }, { title: "Valor", width: 1, align: "right" }],
        rows: [...byCategory.entries()]
          .sort((a, b) => b[1].comparedTo(a[1]))
          .map(([category, value]) => [category, brl(value)]),
        totals: [["Total de despesas", brl(expenses)]],
      },
      {
        title: "Resultado do período",
        pairs: [
          ["Lucro bruto", brl(grossProfit)],
          ["(-) Despesas pagas", brl(expenses)],
          ["(=) Resultado", brl(net)],
        ],
        note: "Despesas entram pela data do pagamento; vendas, pela data de emissão.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------

async function commissionReport(period: Period): Promise<ReportResult> {
  const sales = (await periodSales(period)).filter((s) => s.status === "COMPLETED");
  const products = await productMap(sales.flatMap((s) => s.items.map((i) => i.productId)));

  type Row = { quantity: Decimal; revenue: Decimal; commission: Decimal; pct: Decimal };
  const byProduct = new Map<string, Row>();

  for (const sale of sales) {
    for (const item of sale.items) {
      const row = byProduct.get(item.productId) ??
        { quantity: ZERO, revenue: ZERO, commission: ZERO, pct: ZERO };
      row.quantity = row.quantity.plus(D(item.quantity));
      row.revenue = row.revenue.plus(D(item.total));
      row.commission = row.commission.plus(D(item.commissionValue ?? 0));
      row.pct = D(item.commissionPct ?? 0);
      byProduct.set(item.productId, row);
    }
  }

  const rows = [...byProduct.entries()]
    .map(([productId, row]) => ({ product: products.get(productId), ...row }))
    .filter((row) => row.commission.greaterThan(0))
    .sort((a, b) => b.commission.comparedTo(a.commission));

  const total = sum(rows.map((r) => r.commission));

  return {
    title: "Comissões por produto",
    kpis: [
      { label: "Comissão total", value: brl(total), tone: "green" },
      { label: "Produtos com comissão", value: String(rows.length) },
      { label: "Vendas no período", value: String(sales.length) },
    ],
    sections: [
      {
        title: "Comissão apurada",
        note: rows.length
          ? "O percentual é o que estava cadastrado no produto no momento de cada venda."
          : "Nenhum produto tem comissão cadastrada, ou não houve venda deles no período. " +
            "A comissão é configurada no cadastro de cada produto.",
        columns: [
          { title: "Produto", width: 2.6 },
          { title: "Qtd", width: 1, align: "right" },
          { title: "Vendido", width: 1.2, align: "right" },
          { title: "%", width: 0.8, align: "right" },
          { title: "Comissão", width: 1.2, align: "right" },
        ],
        rows: rows.map((row) => [
          productName(row.product),
          `${num(qty(row.quantity), 3)} ${unitOf(row.product)}`,
          brl(row.revenue),
          `${num(row.pct, 2)}%`,
          brl(row.commission),
        ]),
        totals: [["Total a pagar de comissão", brl(total)]],
      },
    ],
  };
}

// ---------------------------------------------------------------------------

async function marginReport(period: Period): Promise<ReportResult> {
  const sales = (await periodSales(period)).filter((s) => s.status === "COMPLETED");
  const products = await productMap(sales.flatMap((s) => s.items.map((i) => i.productId)));

  type Row = { quantity: Decimal; revenue: Decimal; cost: Decimal };
  const byProduct = new Map<string, Row>();

  for (const sale of sales) {
    for (const item of sale.items) {
      const row = byProduct.get(item.productId) ?? { quantity: ZERO, revenue: ZERO, cost: ZERO };
      row.quantity = row.quantity.plus(D(item.quantity));
      row.revenue = row.revenue.plus(D(item.total));
      row.cost = row.cost.plus(D(item.totalCost));
      byProduct.set(item.productId, row);
    }
  }

  const rows = [...byProduct.entries()]
    .map(([productId, row]) => {
      const profit = money(row.revenue.minus(row.cost));
      return {
        product: products.get(productId),
        ...row,
        profit,
        marginPct: row.revenue.greaterThan(0)
          ? pct(profit.dividedBy(row.revenue).times(100)) : ZERO,
      };
    })
    .sort((a, b) => b.profit.comparedTo(a.profit));

  const revenue = sum(rows.map((r) => r.revenue));
  const profit = sum(rows.map((r) => r.profit));

  return {
    title: "Margem por produto",
    kpis: [
      { label: "Receita", value: brl(revenue), tone: "green" },
      { label: "Lucro bruto", value: brl(profit), tone: "green" },
      { label: "Margem média", value: revenue.greaterThan(0)
        ? `${num(pct(profit.dividedBy(revenue).times(100)), 1)}%` : "—" },
    ],
    sections: [
      {
        title: "Do mais lucrativo ao menos",
        columns: [
          { title: "Produto", width: 2.4 },
          { title: "Qtd", width: 1, align: "right" },
          { title: "Receita", width: 1.2, align: "right" },
          { title: "Custo", width: 1.2, align: "right" },
          { title: "Lucro", width: 1.2, align: "right" },
          { title: "Margem", width: 1, align: "right" },
        ],
        rows: rows.map((row) => [
          productName(row.product),
          num(qty(row.quantity), 2),
          brl(row.revenue),
          brl(row.cost),
          brl(row.profit),
          `${num(row.marginPct, 1)}%`,
        ]),
        totals: [["Lucro bruto do período", brl(profit)]],
      },
    ],
  };
}

// ---------------------------------------------------------------------------

async function kardexReport(period: Period): Promise<ReportResult> {
  const movements = (await db.movements.toArray())
    .filter((m) => inPeriod(m.createdAt, period))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const products = await productMap(movements.map((m) => m.productId));

  const inQty = sum(movements.filter((m) => m.type === "IN").map((m) => D(m.quantity)));
  const outQty = sum(movements.filter((m) => m.type === "OUT").map((m) => D(m.quantity)));

  return {
    title: "Movimentações de estoque",
    kpis: [
      { label: "Lançamentos", value: String(movements.length) },
      { label: "Entradas", value: num(inQty, 2), tone: "green" },
      { label: "Saídas", value: num(outQty, 2), tone: "red" },
    ],
    sections: [
      {
        title: "Entradas e saídas",
        columns: [
          { title: "Data", width: 1.3 },
          { title: "Produto", width: 2.2 },
          { title: "Motivo", width: 1.3 },
          { title: "Qtd", width: 1, align: "right" },
          { title: "Custo un.", width: 1, align: "right" },
          { title: "Saldo", width: 1, align: "right" },
        ],
        rows: movements.map((movement) => [
          fmtDate(movement.createdAt),
          productName(products.get(movement.productId)),
          `${movement.type === "OUT" ? "−" : movement.type === "IN" ? "+" : "="} ` +
            `${MOVEMENT_REASON_LABELS[movement.reason] ?? movement.reason}`,
          num(D(movement.quantity), 3),
          brl(movement.unitCost),
          num(D(movement.balanceAfter), 3),
        ]),
      },
    ],
  };
}

// ---------------------------------------------------------------------------

const EXTRAORDINARY = new Set(["LOSS", "ADJUSTMENT", "INVENTORY", "RETURN_IN", "RETURN_OUT"]);

async function adjustmentsReport(period: Period): Promise<ReportResult> {
  const movements = (await db.movements.toArray())
    .filter((m) => EXTRAORDINARY.has(m.reason) && inPeriod(m.createdAt, period))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const products = await productMap(movements.map((m) => m.productId));

  const value = (m: Movement) => money(D(m.quantity).times(D(m.unitCost)));
  const losses = movements.filter((m) => m.reason === "LOSS");
  const withDocument = movements.filter((m) => m.attachmentId);
  const semDocumento = movements.length - withDocument.length;

  return {
    title: "Ajustes extraordinários",
    kpis: [
      { label: "Lançamentos", value: String(movements.length) },
      { label: "Valor em perdas", value: brl(sum(losses.map(value))), tone: "red" },
      { label: "Com documento", value: `${withDocument.length} de ${movements.length}`,
        tone: semDocumento ? "red" : "green" },
    ],
    sections: [
      {
        title: "Lançamentos fora da operação normal",
        note: semDocumento
          ? `${semDocumento} lançamento(s) sem documento de autorização anexado.`
          : "Todos os lançamentos do período têm documento anexado.",
        columns: [
          { title: "Data", width: 1.2 },
          { title: "Produto", width: 2.2 },
          { title: "Tipo", width: 1.2 },
          { title: "Qtd", width: 0.9, align: "right" },
          { title: "Valor", width: 1, align: "right" },
          { title: "Doc.", width: 0.6 },
          { title: "Justificativa", width: 2.4 },
        ],
        rows: movements.map((movement) => [
          fmtDate(movement.createdAt),
          productName(products.get(movement.productId)),
          MOVEMENT_REASON_LABELS[movement.reason] ?? movement.reason,
          num(D(movement.quantity), 3),
          brl(value(movement)),
          movement.attachmentId ? "sim" : "NÃO",
          movement.note ?? "—",
        ]),
        totals: [["Valor total ajustado", brl(sum(movements.map(value)))]],
      },
    ],
  };
}

// ---------------------------------------------------------------------------

async function priceReport(period: Period): Promise<ReportResult> {
  const changes = (await db.priceChanges.toArray())
    .filter((change) => inPeriod(change.createdAt, period))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const products = await productMap(changes.map((c) => c.productId));
  const semDocumento = changes.filter((c) => !c.attachmentId).length;

  return {
    title: "Alterações de preço",
    kpis: [
      { label: "Alterações", value: String(changes.length) },
      { label: "Com documento", value: `${changes.length - semDocumento} de ${changes.length}`,
        tone: semDocumento ? "red" : "green" },
    ],
    sections: [
      {
        title: "Histórico de preços",
        columns: [
          { title: "Data", width: 1.2 },
          { title: "Produto", width: 2.2 },
          { title: "Tabela", width: 1 },
          { title: "De", width: 1, align: "right" },
          { title: "Para", width: 1, align: "right" },
          { title: "Doc.", width: 0.6 },
          { title: "Motivo", width: 2.4 },
        ],
        rows: changes.map((change) => [
          fmtDate(change.createdAt),
          productName(products.get(change.productId)),
          change.field === "salePrice" ? "Varejo" : "Atacado",
          brl(change.oldValue),
          brl(change.newValue),
          change.attachmentId ? "sim" : "NÃO",
          change.reason,
        ]),
      },
    ],
  };
}

// ---------------------------------------------------------------------------

async function inventoriesReport(period: Period): Promise<ReportResult> {
  const inventories = (await db.inventories.toArray())
    .filter((inventory) => inPeriod(inventory.startedAt, period))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  const closed = inventories.filter((i) => i.status === "CLOSED");

  return {
    title: "Inventários",
    kpis: [
      { label: "Contagens", value: String(inventories.length) },
      { label: "Fechadas", value: String(closed.length) },
      { label: "Divergência acumulada",
        value: brl(sum(closed.map((i) => D(i.diffValue ?? 0)))) },
    ],
    sections: [
      {
        title: "Contagens do período",
        columns: [
          { title: "Código", width: 1.4 },
          { title: "Aberto em", width: 1.2 },
          { title: "Fechado em", width: 1.2 },
          { title: "Itens", width: 0.8, align: "right" },
          { title: "Situação", width: 1.2 },
          { title: "Doc.", width: 0.6 },
          { title: "Divergência", width: 1.2, align: "right" },
        ],
        rows: inventories.map((inventory) => [
          inventory.code,
          fmtDate(inventory.startedAt),
          inventory.finishedAt ? fmtDate(inventory.finishedAt) : "—",
          String(inventory.items.length),
          INVENTORY_STATUS_LABELS[inventory.status] ?? inventory.status,
          inventory.attachmentId ? "sim" : "—",
          inventory.diffValue ? brl(inventory.diffValue) : "—",
        ]),
      },
    ],
  };
}

// ---------------------------------------------------------------------------

async function reconciliationReport(period: Period): Promise<ReportResult> {
  const lines = (await db.statementLines.toArray())
    .filter((line) => inPeriod(line.date, period))
    .sort((a, b) => a.date.localeCompare(b.date));

  const statements = new Map((await db.statements.toArray()).map((s) => [s.id, s]));
  const accounts = new Map((await db.accounts.toArray()).map((a) => [a.id, a.name]));

  const pending = lines.filter((line) => line.status === "PENDING");
  const credits = lines.filter((line) => D(line.amount).greaterThan(0));
  const fees = sum(lines.map((line) => D(line.feeAmount ?? 0)));

  const salesInPeriod = (await db.sales.toArray())
    .filter((sale) => sale.status === "COMPLETED" && inPeriod(sale.soldAt, period));
  const naoConferidas = salesInPeriod.filter((sale) => !sale.reconciledAt);

  return {
    title: "Conciliação bancária",
    kpis: [
      { label: "Linhas do extrato", value: String(lines.length) },
      { label: "A conferir", value: String(pending.length),
        tone: pending.length ? "red" : "green" },
      { label: "Vendas sem crédito", value: String(naoConferidas.length),
        tone: naoConferidas.length ? "red" : "green" },
      { label: "Taxas de cartão", value: brl(fees) },
    ],
    sections: [
      {
        title: "Lançamentos do extrato",
        note: `${credits.length} crédito(s) no período. ` +
          "O que estiver como \"A conferir\" ainda não virou lançamento no financeiro.",
        columns: [
          { title: "Data", width: 1.1 },
          { title: "Conta", width: 1.3 },
          { title: "Histórico", width: 3 },
          { title: "Situação", width: 1.2 },
          { title: "Valor", width: 1.1, align: "right" },
        ],
        rows: lines.map((line) => {
          const statement = statements.get(line.statementId);
          return [
            fmtDate(line.date),
            statement ? accounts.get(statement.accountId) ?? "—" : "—",
            line.description,
            STATEMENT_LINE_STATUS_LABELS[line.status] ?? line.status,
            brl(line.amount),
          ];
        }),
      },
      {
        title: "Vendas sem crédito correspondente",
        note: naoConferidas.length
          ? "Vendas registradas que ainda não apareceram em nenhum extrato importado."
          : "Toda venda do período tem crédito correspondente no extrato.",
        columns: [
          { title: "Venda", width: 1.4 },
          { title: "Data", width: 1.2 },
          { title: "Pagamento", width: 1.4 },
          { title: "Total", width: 1.2, align: "right" },
        ],
        rows: naoConferidas.map((sale) => [
          sale.number,
          fmtDate(sale.soldAt),
          PAYMENT_METHOD_LABELS[sale.paymentMethod] ?? sale.paymentMethod,
          brl(sale.total),
        ]),
        totals: [["Valor sem conferência", brl(sum(naoConferidas.map((s) => D(s.total))))]],
      },
    ],
  };
}

// ---------------------------------------------------------------------------

async function stockReport(): Promise<ReportResult> {
  const products = (await db.products.toArray())
    .filter((p) => !p.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name));

  const valueOf = (p: Product) => money(D(p.quantity).times(D(p.avgCost)));
  const total = sum(products.map(valueOf));
  const below = products.filter(
    (p) => D(p.minStock).greaterThan(0) && D(p.quantity).lessThan(D(p.minStock)),
  );

  return {
    title: "Posição de estoque",
    kpis: [
      { label: "Itens", value: String(products.length) },
      { label: "Valor do estoque", value: brl(total), tone: "green" },
      { label: "Abaixo do mínimo", value: String(below.length),
        tone: below.length ? "red" : "green" },
    ],
    sections: [
      {
        title: "Saldo por item",
        columns: [
          { title: "Produto", width: 2.6 },
          { title: "Código", width: 1 },
          { title: "Saldo", width: 1, align: "right" },
          { title: "Custo médio", width: 1.2, align: "right" },
          { title: "Valor", width: 1.2, align: "right" },
        ],
        rows: products.map((product) => [
          product.name,
          product.sku,
          `${num(D(product.quantity), 3)} ${unitOf(product)}`,
          brl(product.avgCost),
          brl(valueOf(product)),
        ]),
        totals: [["Valor total em estoque", brl(total)]],
      },
    ],
  };
}

// ---------------------------------------------------------------------------

async function auditReport(period: Period): Promise<ReportResult> {
  const logs = (await db.logs.toArray())
    .filter((log) => inPeriod(log.createdAt, period))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const byEntity = new Map<string, number>();
  for (const log of logs) byEntity.set(log.entity, (byEntity.get(log.entity) ?? 0) + 1);

  return {
    title: "Trilha de auditoria",
    kpis: [
      { label: "Registros", value: String(logs.length) },
      { label: "Áreas tocadas", value: String(byEntity.size) },
    ],
    sections: [
      {
        title: "Resumo por área",
        columns: [{ title: "Área", width: 3 }, { title: "Registros", width: 1, align: "right" }],
        rows: [...byEntity.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([entity, count]) => [entity, String(count)]),
      },
      {
        title: "Tudo o que aconteceu",
        columns: [
          { title: "Quando", width: 1.6 },
          { title: "Área", width: 1.2 },
          { title: "O que foi feito", width: 4 },
        ],
        rows: logs.map((log) => [datetime(log.createdAt), log.entity, log.summary]),
      },
    ],
  };
}

function sum(values: Decimal[]): Decimal {
  return money(values.reduce((acc, value) => acc.plus(value), ZERO));
}
