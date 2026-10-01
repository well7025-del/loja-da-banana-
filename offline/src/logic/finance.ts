import { db, newId, nowIso, registerLog } from "@/data/db";
import type { FinanceDirection, FinanceEntry, PaymentMethod, Transfer } from "@/data/types";
import { D, ZERO, money, store } from "@/lib/money";
import { brl } from "@/lib/format";
import { BusinessError } from "./codes";
import { attachFile } from "./attachments";
import type Decimal from "decimal.js";

export async function createFinanceEntry(input: {
  direction: FinanceDirection;
  description: string;
  amount: string | number;
  dueDate: string;
  category?: string | null;
  customerId?: string | null;
  supplierName?: string | null;
  installments?: number;
  notes?: string;
  accountId?: string | null;
  /** Nota fiscal, recibo ou autorização do lançamento. */
  document?: File | null;
}): Promise<FinanceEntry[]> {
  const amount = money(input.amount);
  if (amount.lessThanOrEqualTo(0)) throw new BusinessError("Informe um valor maior que zero.");

  const count = Math.max(1, Number(input.installments ?? 1));
  const per = money(amount.dividedBy(count));
  const first = new Date(input.dueDate);
  const created: FinanceEntry[] = [];

  for (let i = 1; i <= count; i++) {
    const value = i === count ? money(amount.minus(per.times(count - 1))) : per;
    const due = new Date(first);
    due.setMonth(due.getMonth() + (i - 1));

    const entry: FinanceEntry = {
      id: newId(),
      direction: input.direction,
      status: "OPEN",
      description: count > 1 ? `${input.description} (${i}/${count})` : input.description,
      category: input.category ?? null,
      customerId: input.customerId ?? null,
      supplierName: input.supplierName ?? null,
      saleId: null,
      amount: store(value),
      paidAmount: "0",
      dueDate: due.toISOString(),
      issuedAt: nowIso(),
      paidAt: null,
      installment: i,
      installments: count,
      payments: [],
      notes: input.notes ?? null,
      accountId: input.accountId ?? null,
      attachmentId: null,
      reconciledAt: null,
      statementLineId: null,
      deletedAt: null,
    };
    await db.finance.add(entry);
    created.push(entry);
  }

  // O documento vale para o lançamento todo; as parcelas apontam para ele.
  if (input.document && created.length) {
    const attachment = await attachFile(
      { entity: "FinanceEntry", entityId: created[0].id },
      input.document,
      input.description,
    );
    for (const entry of created) {
      await db.finance.update(entry.id, { attachmentId: attachment.id });
      entry.attachmentId = attachment.id;
    }
  }

  await registerLog(
    "CREATE", "Financeiro",
    `${input.direction === "PAYABLE" ? "Conta a pagar" : "Conta a receber"}: ` +
      `${input.description} — ${brl(amount)}` +
      (input.document ? " (com documento anexado)" : ""),
    created[0]?.id,
  );
  return created;
}

/**
 * Transferência entre contas próprias (do caixa para o banco, por exemplo).
 *
 * Não é receita nem despesa: não entra no resultado, só fica registrada com
 * o comprovante anexado. É por isso que tem tabela própria em vez de virar
 * um par de lançamentos que inflaria o financeiro.
 */
export async function createTransfer(input: {
  fromAccountId: string;
  toAccountId: string;
  amount: string | number;
  description: string;
  happenedAt?: string;
  document?: File | null;
}): Promise<Transfer> {
  const amount = money(input.amount);
  if (amount.lessThanOrEqualTo(0)) throw new BusinessError("Informe um valor maior que zero.");
  if (!input.fromAccountId || !input.toAccountId) {
    throw new BusinessError("Escolha a conta de origem e a de destino.");
  }
  if (input.fromAccountId === input.toAccountId) {
    throw new BusinessError("A conta de origem e a de destino precisam ser diferentes.");
  }

  const [from, to] = await Promise.all([
    db.accounts.get(input.fromAccountId),
    db.accounts.get(input.toAccountId),
  ]);
  if (!from || !to) throw new BusinessError("Conta não encontrada.");

  const transfer: Transfer = {
    id: newId(),
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amount: store(amount),
    description: input.description.trim() || `${from.name} → ${to.name}`,
    happenedAt: input.happenedAt ? new Date(input.happenedAt).toISOString() : nowIso(),
    attachmentId: null,
    createdAt: nowIso(),
    deletedAt: null,
  };
  await db.transfers.add(transfer);

  if (input.document) {
    const attachment = await attachFile(
      { entity: "Transfer", entityId: transfer.id },
      input.document,
      transfer.description,
    );
    await db.transfers.update(transfer.id, { attachmentId: attachment.id });
    transfer.attachmentId = attachment.id;
  }

  await registerLog(
    "CREATE", "Transferência",
    `${from.name} → ${to.name}: ${brl(amount)}` +
      (input.document ? " (com comprovante)" : ""),
    transfer.id,
  );
  return transfer;
}

/** Baixa total ou parcial de um título. */
export async function registerPayment(input: {
  entryId: string;
  amount?: string | number;
  method: PaymentMethod;
  paidAt?: string;
  note?: string;
}) {
  return db.transaction("rw", [db.finance, db.logs], async () => {
    const entry = await db.finance.get(input.entryId);
    if (!entry) throw new BusinessError("Título não encontrado.");
    if (entry.status === "PAID") throw new BusinessError("Este título já está quitado.");
    if (entry.status === "CANCELLED") throw new BusinessError("Este título foi cancelado.");

    const outstanding = money(D(entry.amount).minus(D(entry.paidAmount)));
    const amount = input.amount ? money(input.amount) : outstanding;
    if (amount.lessThanOrEqualTo(0)) throw new BusinessError("Valor de pagamento inválido.");
    if (amount.greaterThan(outstanding)) {
      throw new BusinessError(`Valor acima do saldo devedor (${brl(outstanding)}).`);
    }

    const paidAmount = money(D(entry.paidAmount).plus(amount));
    const settled = paidAmount.greaterThanOrEqualTo(D(entry.amount));

    await db.finance.update(entry.id, {
      paidAmount: store(paidAmount),
      status: settled ? "PAID" : "PARTIAL",
      paidAt: settled ? nowIso() : null,
      payments: [
        ...entry.payments,
        {
          amount: store(amount),
          method: input.method,
          paidAt: input.paidAt ? new Date(input.paidAt).toISOString() : nowIso(),
          note: input.note ?? null,
        },
      ],
    });

    await registerLog(
      "UPDATE", "Financeiro",
      `Baixa de ${brl(amount)} em "${entry.description}" (${input.method})`,
      entry.id,
    );
  });
}

export async function cancelFinanceEntry(id: string) {
  const entry = await db.finance.get(id);
  if (!entry) throw new BusinessError("Título não encontrado.");
  if (entry.status === "PAID") throw new BusinessError("Título quitado não pode ser cancelado.");
  await db.finance.update(id, { status: "CANCELLED" });
  await registerLog("CANCEL", "Financeiro", `Cancelou o título "${entry.description}"`, id);
}

export type FinanceSummary = {
  toReceive: Decimal;
  toReceiveCount: number;
  toPay: Decimal;
  toPayCount: number;
  overdueReceivable: Decimal;
  overdueReceivableCount: number;
  overduePayable: Decimal;
  overduePayableCount: number;
  receivedMonth: Decimal;
  paidMonth: Decimal;
  realizedResult: Decimal;
  projectedResult: Decimal;
};

export async function financeSummary(reference = new Date()): Promise<FinanceSummary> {
  const entries = (await db.finance.toArray()).filter((e) => !e.deletedAt);
  const today = reference.toISOString();
  const monthStart = new Date(reference.getFullYear(), reference.getMonth(), 1).toISOString();
  const monthEnd = new Date(
    reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59, 999,
  ).toISOString();

  const open = entries.filter((e) => e.status === "OPEN" || e.status === "PARTIAL");
  const outstanding = (list: FinanceEntry[]) =>
    money(list.reduce((a, e) => a.plus(D(e.amount).minus(D(e.paidAmount))), ZERO));

  const openIn = open.filter((e) => e.direction === "RECEIVABLE");
  const openOut = open.filter((e) => e.direction === "PAYABLE");
  const lateIn = openIn.filter((e) => e.dueDate < today);
  const lateOut = openOut.filter((e) => e.dueDate < today);

  let received = ZERO;
  let paid = ZERO;
  for (const entry of entries) {
    for (const payment of entry.payments) {
      if (payment.paidAt < monthStart || payment.paidAt > monthEnd) continue;
      if (entry.direction === "RECEIVABLE") received = received.plus(D(payment.amount));
      else paid = paid.plus(D(payment.amount));
    }
  }

  return {
    toReceive: outstanding(openIn),
    toReceiveCount: openIn.length,
    toPay: outstanding(openOut),
    toPayCount: openOut.length,
    overdueReceivable: outstanding(lateIn),
    overdueReceivableCount: lateIn.length,
    overduePayable: outstanding(lateOut),
    overduePayableCount: lateOut.length,
    receivedMonth: money(received),
    paidMonth: money(paid),
    realizedResult: money(received.minus(paid)),
    projectedResult: money(outstanding(openIn).minus(outstanding(openOut))),
  };
}

/** Entradas e saídas dia a dia, realizadas e previstas. */
export async function cashFlow(from: Date, to: Date) {
  const entries = (await db.finance.toArray()).filter((e) => !e.deletedAt);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  type Day = {
    date: string; inflow: Decimal; outflow: Decimal; plannedIn: Decimal; plannedOut: Decimal;
  };
  const days = new Map<string, Day>();
  const bucket = (iso: string) => {
    const key = iso.slice(0, 10);
    if (!days.has(key)) {
      days.set(key, { date: key, inflow: ZERO, outflow: ZERO, plannedIn: ZERO, plannedOut: ZERO });
    }
    return days.get(key)!;
  };

  for (const entry of entries) {
    for (const payment of entry.payments) {
      if (payment.paidAt < fromIso || payment.paidAt > toIso) continue;
      const day = bucket(payment.paidAt);
      if (entry.direction === "RECEIVABLE") day.inflow = day.inflow.plus(D(payment.amount));
      else day.outflow = day.outflow.plus(D(payment.amount));
    }
    if (
      (entry.status === "OPEN" || entry.status === "PARTIAL") &&
      entry.dueDate >= fromIso && entry.dueDate <= toIso
    ) {
      const day = bucket(entry.dueDate);
      const rest = D(entry.amount).minus(D(entry.paidAmount));
      if (entry.direction === "RECEIVABLE") day.plannedIn = day.plannedIn.plus(rest);
      else day.plannedOut = day.plannedOut.plus(rest);
    }
  }

  const rows = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  let running = ZERO;
  const series = rows.map((row) => {
    const net = row.inflow.minus(row.outflow);
    running = running.plus(net);
    return {
      date: row.date,
      inflow: money(row.inflow),
      outflow: money(row.outflow),
      plannedIn: money(row.plannedIn),
      plannedOut: money(row.plannedOut),
      net: money(net),
      accumulated: money(running),
    };
  });

  return {
    series,
    totals: {
      inflow: money(series.reduce((a, r) => a.plus(r.inflow), ZERO)),
      outflow: money(series.reduce((a, r) => a.plus(r.outflow), ZERO)),
      plannedIn: money(series.reduce((a, r) => a.plus(r.plannedIn), ZERO)),
      plannedOut: money(series.reduce((a, r) => a.plus(r.plannedOut), ZERO)),
      net: money(series.reduce((a, r) => a.plus(r.net), ZERO)),
    },
  };
}
