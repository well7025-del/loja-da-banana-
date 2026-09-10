import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { D, ZERO, money } from "@/lib/money";
import { brl, relativeDays } from "@/lib/format";
import { CUSTOMER_TYPE_LABELS } from "@/lib/defaults";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterPills, SearchInput } from "@/components/search-input";
import { can } from "@/lib/permissions";
import type { CustomerType } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; tipo?: string }> }) {
  const user = (await getCurrentUser())!;
  const { q, tipo } = await searchParams;

  const customers = await prisma.customer.findMany({
    where: {
      companyId: user.companyId, deletedAt: null,
      ...(tipo ? { type: tipo as CustomerType } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { taxId: { contains: q } },
              { phone: { contains: q } },
              { whatsapp: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      sales: { where: { status: "COMPLETED" }, select: { total: true, soldAt: true } },
      financeEntries: {
        where: { direction: "RECEIVABLE", status: { in: ["OPEN", "PARTIAL"] }, deletedAt: null },
        select: { amount: true, paidAmount: true, dueDate: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle={`${customers.length} cadastrado(s)`}
        action={can(user.permissions, "customers.create") ? (
          <Link href="/clientes/novo" className="btn-banana btn-sm">+ Novo</Link>
        ) : null}
      />

      <div className="space-y-2">
        <SearchInput placeholder="Buscar por nome, documento ou telefone" />
        <FilterPills
          paramName="tipo"
          options={Object.entries(CUSTOMER_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </div>

      <div className="mt-3">
        {customers.length === 0 ? (
          <EmptyState icon="👥" title="Nenhum cliente cadastrado"
            action={<Link href="/clientes/novo" className="btn-primary btn-sm">Cadastrar cliente</Link>} />
        ) : (
          <Card pad={false}>
            {customers.map((customer) => {
              const total = customer.sales.reduce((a, s) => a.plus(D(s.total)), ZERO);
              const last = customer.sales.reduce<Date | null>((acc, s) => (!acc || s.soldAt > acc ? s.soldAt : acc), null);
              const open = customer.financeEntries.reduce((a, e) => a.plus(D(e.amount).minus(D(e.paidAmount))), ZERO);
              const overdue = customer.financeEntries.some((e) => e.dueDate < new Date());
              return (
                <Link key={customer.id} href={`/clientes/${customer.id}`} className="block active:bg-ink-50">
                  <div className="row">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-ink-900">{customer.name}</span>
                        {overdue && <Badge tone="red">em atraso</Badge>}
                        {!customer.active && <Badge>inativo</Badge>}
                      </div>
                      <p className="truncate text-xs text-ink-500">
                        {CUSTOMER_TYPE_LABELS[customer.type]}
                        {customer.city && ` · ${customer.city}`}
                        {last && ` · última compra ${relativeDays(last)}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums text-ink-900">{brl(money(total))}</p>
                      {open.greaterThan(0) && (
                        <p className={`text-xs font-semibold ${overdue ? "text-red-600" : "text-ink-500"}`}>
                          {brl(money(open))} em aberto
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
