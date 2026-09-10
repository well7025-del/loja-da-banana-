"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { money } from "@/lib/money";
import { createFinanceEntry, registerPayment } from "@/server/services/finance";
import { type ActionState, bool, optional, str, toActionError } from "./_helpers";
import type { FinanceDirection, PaymentMethod } from "@prisma/client";

export async function createFinanceEntryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("finance.create");
    const description = str(form, "description");
    if (!description) return { error: "Informe a descrição do lançamento." };
    const dueDate = str(form, "dueDate");
    if (!dueDate) return { error: "Informe a data de vencimento." };

    await createFinanceEntry(user, {
      direction: (str(form, "direction") || "PAYABLE") as FinanceDirection,
      description,
      amount: str(form, "amount"),
      dueDate,
      categoryId: optional(form, "categoryId"),
      customerId: optional(form, "customerId"),
      supplierId: optional(form, "supplierId"),
      installments: Number(str(form, "installments") || 1),
      notes: optional(form, "notes") ?? undefined,
    });

    revalidatePath("/financeiro");
    return { success: "Lançamento registrado." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function registerPaymentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("finance.update");
    await registerPayment(user, {
      entryId: str(form, "entryId"),
      amount: str(form, "amount") || undefined,
      method: (str(form, "method") || "PIX") as PaymentMethod,
      paidAt: str(form, "paidAt") || undefined,
      note: optional(form, "note") ?? undefined,
    });
    revalidatePath("/financeiro");
    revalidatePath("/");
    return { success: "Baixa registrada com sucesso." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function cancelFinanceEntryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("finance.delete");
    const id = str(form, "id");
    const entry = await prisma.financeEntry.findFirstOrThrow({ where: { id, companyId: user.companyId } });
    if (entry.status === "PAID") return { error: "Título quitado não pode ser cancelado." };
    await prisma.financeEntry.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit({ user, action: "CANCEL", entity: "FinanceEntry", entityId: id, summary: `Cancelou o título "${entry.description}"` });
    revalidatePath("/financeiro");
    return { success: "Título cancelado." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveExpenseAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("finance.create");
    const description = str(form, "description");
    if (!description) return { error: "Informe a descrição da despesa." };
    const amount = money(str(form, "amount"));
    if (amount.lessThanOrEqualTo(0)) return { error: "Informe um valor maior que zero." };

    const expense = await prisma.expense.create({
      data: {
        companyId: user.companyId,
        description,
        amount,
        categoryId: optional(form, "categoryId"),
        incurredAt: str(form, "incurredAt") ? new Date(str(form, "incurredAt")) : new Date(),
        recurring: bool(form, "recurring"),
        isFixedOverhead: bool(form, "isFixedOverhead"),
        notes: optional(form, "notes"),
      },
    });

    // Toda despesa vira uma conta a pagar para aparecer no fluxo de caixa
    if (bool(form, "generatePayable")) {
      await createFinanceEntry(user, {
        direction: "PAYABLE",
        description,
        amount,
        dueDate: str(form, "incurredAt") || new Date().toISOString(),
        categoryId: optional(form, "categoryId"),
      });
    }

    await audit({
      user, action: "CREATE", entity: "Expense", entityId: expense.id,
      summary: `Despesa: ${description} — R$ ${amount.toFixed(2)}`,
    });
    revalidatePath("/financeiro/despesas");
    return { success: "Despesa registrada." };
  } catch (error) {
    return toActionError(error);
  }
}
