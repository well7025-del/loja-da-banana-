import "server-only";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { D, ZERO, money } from "@/lib/money";
import { brl, date } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader, StatCard } from "@/components/ui";
import { FilterPills } from "@/components/search-input";
import { EntriesList, type EntryRow } from "./entries-list";
import type { FinanceDirection } from "@prisma/client";

export async function EntriesPage({
  direction, filtro, title, subtitle,
}: { direction: FinanceDirection; filtro?: string; title: string; subtitle: string }) {
  const user = (await getCurrentUser())!;
  const now = new Date();

  const entries = await prisma.financeEntry.findMany({
    where: {
      companyId: user.companyId, direction, deletedAt: null,
      ...(filtro === "vencidas" ? { status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: now } } : {}),
      ...(filtro === "quitadas" ? { status: "PAID" } : {}),
      ...(!filtro || filtro === "abertas" ? { status: { in: ["OPEN", "PARTIAL"] } } : {}),
    },
    include: { customer: true, supplier: true, category: true },
    orderBy: { dueDate: "asc" },
    take: 150,
  });

  const total = entries.reduce((a, e) => a.plus(D(e.amount).minus(D(e.paidAmount))), ZERO);
  const overdue = entries
    .filter((e) => e.dueDate < now && e.status !== "PAID")
    .reduce((a, e) => a.plus(D(e.amount).minus(D(e.paidAmount))), ZERO);

  const rows: EntryRow[] = entries.map((e) => ({
    id: e.id,
    description: e.description,
    partner: e.customer?.name ?? e.supplier?.name ?? e.category?.name ?? "—",
    amount: D(e.amount).toFixed(2),
    outstanding: money(D(e.amount).minus(D(e.paidAmount))).toFixed(2),
    dueDate: date(e.dueDate),
    status: e.status,
    late: e.dueDate < now && e.status !== "PAID" && e.status !== "CANCELLED",
  }));

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={can(user.permissions, "finance.create") ? (
          <Link href={`/financeiro/novo?tipo=${direction}`} className="btn-banana btn-sm">+ Lançar</Link>
        ) : null}
      />

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Em aberto" value={brl(money(total))} hint={`${entries.length} título(s)`} />
        <StatCard label="Vencido" value={brl(money(overdue))} tone={overdue.greaterThan(0) ? "red" : "green"} />
      </div>

      <div className="mt-3">
        <FilterPills
          paramName="filtro"
          allLabel={null}
          options={[
            { value: "abertas", label: "Em aberto" },
            { value: "vencidas", label: "Vencidas" },
            { value: "quitadas", label: "Quitadas" },
          ]}
        />
      </div>

      <div className="mt-3">
        <EntriesList entries={rows} direction={direction} canPay={can(user.permissions, "finance.update")} />
      </div>
    </div>
  );
}
