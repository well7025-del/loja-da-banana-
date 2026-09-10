import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { financeCategories } from "@/server/queries";
import { D, ZERO, money } from "@/lib/money";
import { brl, date } from "@/lib/format";
import { Card, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { ExpenseForm } from "./form";
import { monthRange } from "@/server/services/dashboard";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "finance.read")) redirect("/");
  const month = monthRange();

  const [expenses, categories] = await Promise.all([
    prisma.expense.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      include: { category: true },
      orderBy: { incurredAt: "desc" },
      take: 60,
    }),
    financeCategories(),
  ]);

  const monthTotal = expenses
    .filter((e) => e.incurredAt >= month.start && e.incurredAt <= month.end)
    .reduce((a, e) => a.plus(D(e.amount)), ZERO);
  const fixedTotal = expenses
    .filter((e) => e.isFixedOverhead && e.incurredAt >= month.start)
    .reduce((a, e) => a.plus(D(e.amount)), ZERO);

  return (
    <div>
      <PageHeader title="Despesas" subtitle="Custos operacionais da fábrica" />

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="No mês" value={brl(money(monthTotal))} />
        <StatCard label="Despesas fixas" value={brl(money(fixedTotal))} hint="rateadas no preço" />
      </div>

      {can(user.permissions, "finance.create") && (
        <>
          <SectionTitle>Nova despesa</SectionTitle>
          <ExpenseForm categories={categories.filter((c) => c.direction === "PAYABLE").map((c) => ({ id: c.id, name: c.name }))} />
        </>
      )}

      <SectionTitle>Lançadas</SectionTitle>
      {expenses.length === 0 ? (
        <Card><p className="text-sm text-ink-500">Nenhuma despesa registrada.</p></Card>
      ) : (
        <Card pad={false}>
          {expenses.map((expense) => (
            <div key={expense.id} className="row">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-800">{expense.description}</p>
                <p className="text-xs text-ink-500">
                  {expense.category?.name ?? "Sem categoria"} · {date(expense.incurredAt)}
                  {expense.isFixedOverhead && " · despesa fixa"}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums text-red-600">{brl(expense.amount)}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
