import "server-only";
import { Prisma, prisma } from "@/lib/db";
import { D, money, ZERO } from "@/lib/money";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { BusinessError } from "./inventory";
import { DEFAULT_CATEGORIES } from "@/lib/defaults";

export { DEFAULT_CATEGORIES };
import type { FinanceDirection, PaymentMethod } from "@prisma/client";

export async function createFinanceEntry(
  user: SessionUser,
  input: {
    direction: FinanceDirection;
    description: string;
    amount: Prisma.Decimal | string | number;
    dueDate: string | Date;
    categoryId?: string | null;
    customerId?: string | null;
    supplierId?: string | null;
    installments?: number;
    notes?: string;
  },
) {
  const amount = money(input.amount);
  if (amount.lessThanOrEqualTo(0)) throw new BusinessError("Informe um valor maior que zero.");
  const count = Math.max(1, Number(input.installments ?? 1));
  const per = money(amount.dividedBy(count));
  const first = new Date(input.dueDate);

  const created = await prisma.$transaction(async (tx) => {
    const entries = [];
    for (let i = 1; i <= count; i++) {
      const value = i === count ? money(amount.minus(per.times(count - 1))) : per;
      const due = new Date(first);
      due.setMonth(due.getMonth() + (i - 1));
      entries.push(
        await tx.financeEntry.create({
          data: {
            companyId: user.companyId,
            direction: input.direction,
            description: count > 1 ? `${input.description} (${i}/${count})` : input.description,
            amount: value,
            dueDate: due,
            categoryId: input.categoryId || null,
            customerId: input.customerId || null,
            supplierId: input.supplierId || null,
            installment: i,
            installments: count,
            notes: input.notes ?? null,
          },
        }),
      );
    }
    await audit(
      {
        user, action: "CREATE", entity: "FinanceEntry", entityId: entries[0]?.id,
        summary: `${input.direction === "PAYABLE" ? "Conta a pagar" : "Conta a receber"}: ${input.description} — R$ ${amount.toFixed(2)}`,
      },
      tx,
    );
    return entries;
  });

  return created;
}

/** Baixa (total ou parcial) de um título. */
export async function registerPayment(
  user: SessionUser,
  input: { entryId: string; amount?: string | number; method: PaymentMethod; paidAt?: string; note?: string },
) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.financeEntry.findFirst({
      where: { id: input.entryId, companyId: user.companyId, deletedAt: null },
    });
    if (!entry) throw new BusinessError("Título não encontrado.");
    if (entry.status === "PAID") throw new BusinessError("Este título já está quitado.");
    if (entry.status === "CANCELLED") throw new BusinessError("Este título foi cancelado.");

    const outstanding = money(D(entry.amount).minus(D(entry.paidAmount)));
    const amount = input.amount ? money(input.amount) : outstanding;
    if (amount.lessThanOrEqualTo(0)) throw new BusinessError("Valor de pagamento inválido.");
    if (amount.greaterThan(outstanding)) {
      throw new BusinessError(`Valor acima do saldo devedor (R$ ${outstanding.toFixed(2)}).`);
    }

    await tx.payment.create({
      data: {
        financeEntryId: entry.id,
        amount,
        method: input.method,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        userId: user.id,
        note: input.note ?? null,
      },
    });

    const paidAmount = money(D(entry.paidAmount).plus(amount));
    const settled = paidAmount.greaterThanOrEqualTo(D(entry.amount));

    const updated = await tx.financeEntry.update({
      where: { id: entry.id },
      data: {
        paidAmount,
        status: settled ? "PAID" : "PARTIAL",
        paidAt: settled ? new Date() : null,
      },
    });

    await audit(
      {
        user, action: "UPDATE", entity: "FinanceEntry", entityId: entry.id,
        summary: `Baixa de R$ ${amount.toFixed(2)} em "${entry.description}" (${input.method})`,
      },
      tx,
    );
    return updated;
  });
}

export async function financeSummary(companyId: string, reference = new Date()) {
  const today = new Date(reference);
  today.setHours(23, 59, 59, 999);
  const startOfMonth = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const endOfMonth = new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59, 999);

  const [openReceivable, openPayable, overdueReceivable, overduePayable, receivedMonth, paidMonth] =
    await Promise.all([
      prisma.financeEntry.aggregate({
        where: { companyId, direction: "RECEIVABLE", status: { in: ["OPEN", "PARTIAL"] }, deletedAt: null },
        _sum: { amount: true, paidAmount: true }, _count: true,
      }),
      prisma.financeEntry.aggregate({
        where: { companyId, direction: "PAYABLE", status: { in: ["OPEN", "PARTIAL"] }, deletedAt: null },
        _sum: { amount: true, paidAmount: true }, _count: true,
      }),
      prisma.financeEntry.aggregate({
        where: { companyId, direction: "RECEIVABLE", status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: today }, deletedAt: null },
        _sum: { amount: true, paidAmount: true }, _count: true,
      }),
      prisma.financeEntry.aggregate({
        where: { companyId, direction: "PAYABLE", status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: today }, deletedAt: null },
        _sum: { amount: true, paidAmount: true }, _count: true,
      }),
      prisma.payment.aggregate({
        where: { financeEntry: { companyId, direction: "RECEIVABLE" }, paidAt: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { financeEntry: { companyId, direction: "PAYABLE" }, paidAt: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { amount: true },
      }),
    ]);

  const outstanding = (a: { _sum: { amount: Prisma.Decimal | null; paidAmount: Prisma.Decimal | null } }) =>
    money(D(a._sum.amount).minus(D(a._sum.paidAmount)));

  const received = money(receivedMonth._sum.amount);
  const paid = money(paidMonth._sum.amount);

  return {
    toReceive: outstanding(openReceivable),
    toReceiveCount: openReceivable._count,
    toPay: outstanding(openPayable),
    toPayCount: openPayable._count,
    overdueReceivable: outstanding(overdueReceivable),
    overdueReceivableCount: overdueReceivable._count,
    overduePayable: outstanding(overduePayable),
    overduePayableCount: overduePayable._count,
    receivedMonth: received,
    paidMonth: paid,
    realizedResult: money(received.minus(paid)),
    projectedResult: money(outstanding(openReceivable).minus(outstanding(openPayable))),
    cashBalance: money(received.minus(paid)),
  };
}

/** Fluxo de caixa diário: realizado (pagamentos) + previsto (títulos em aberto). */
export async function cashFlow(companyId: string, from: Date, to: Date) {
  const [payments, pending] = await Promise.all([
    prisma.payment.findMany({
      where: { financeEntry: { companyId, deletedAt: null }, paidAt: { gte: from, lte: to } },
      include: { financeEntry: { select: { direction: true, description: true, categoryId: true } } },
      orderBy: { paidAt: "asc" },
    }),
    prisma.financeEntry.findMany({
      where: { companyId, deletedAt: null, status: { in: ["OPEN", "PARTIAL"] }, dueDate: { gte: from, lte: to } },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const days = new Map<string, { date: string; inflow: Prisma.Decimal; outflow: Prisma.Decimal; plannedIn: Prisma.Decimal; plannedOut: Prisma.Decimal }>();
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const bucket = (d: Date) => {
    const k = key(d);
    if (!days.has(k)) days.set(k, { date: k, inflow: ZERO, outflow: ZERO, plannedIn: ZERO, plannedOut: ZERO });
    return days.get(k)!;
  };

  for (const p of payments) {
    const b = bucket(p.paidAt);
    if (p.financeEntry.direction === "RECEIVABLE") b.inflow = b.inflow.plus(D(p.amount));
    else b.outflow = b.outflow.plus(D(p.amount));
  }
  for (const e of pending) {
    const b = bucket(e.dueDate);
    const rest = D(e.amount).minus(D(e.paidAmount));
    if (e.direction === "RECEIVABLE") b.plannedIn = b.plannedIn.plus(rest);
    else b.plannedOut = b.plannedOut.plus(rest);
  }

  const rows = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  let running = ZERO;
  const series = rows.map((r) => {
    const net = r.inflow.minus(r.outflow);
    running = running.plus(net);
    return {
      ...r,
      inflow: money(r.inflow), outflow: money(r.outflow),
      plannedIn: money(r.plannedIn), plannedOut: money(r.plannedOut),
      net: money(net), accumulated: money(running),
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

/** Clientes com títulos vencidos. */
export async function delinquentCustomers(companyId: string) {
  const rows = await prisma.financeEntry.findMany({
    where: {
      companyId, direction: "RECEIVABLE", status: { in: ["OPEN", "PARTIAL"] },
      dueDate: { lt: new Date() }, deletedAt: null, customerId: { not: null },
    },
    include: { customer: true },
    orderBy: { dueDate: "asc" },
  });

  const map = new Map<string, { customer: NonNullable<(typeof rows)[number]["customer"]>; total: Prisma.Decimal; count: number; oldestDue: Date }>();
  for (const r of rows) {
    if (!r.customer) continue;
    const current = map.get(r.customer.id) ?? { customer: r.customer, total: ZERO, count: 0, oldestDue: r.dueDate };
    current.total = current.total.plus(D(r.amount).minus(D(r.paidAmount)));
    current.count += 1;
    if (r.dueDate < current.oldestDue) current.oldestDue = r.dueDate;
    map.set(r.customer.id, current);
  }
  return [...map.values()].sort((a, b) => b.total.comparedTo(a.total));
}
