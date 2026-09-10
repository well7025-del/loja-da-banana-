import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { D, ZERO, money } from "@/lib/money";
import { brl, date, relativeDays } from "@/lib/format";
import { CUSTOMER_TYPE_LABELS, FINANCE_STATUS_LABELS } from "@/lib/defaults";
import { Card, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { can } from "@/lib/permissions";
import { CustomerForm } from "../form";

export const dynamic = "force-dynamic";

export default async function CustomerPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; editar?: string }> }) {
  const user = (await getCurrentUser())!;
  const { id } = await params;
  const { ok, editar } = await searchParams;

  const customer = await prisma.customer.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      sales: { where: { status: "COMPLETED" }, orderBy: { soldAt: "desc" }, take: 20 },
      financeEntries: {
        where: { direction: "RECEIVABLE", deletedAt: null, status: { in: ["OPEN", "PARTIAL"] } },
        orderBy: { dueDate: "asc" },
      },
    },
  });
  if (!customer) notFound();

  const total = customer.sales.reduce((a, s) => a.plus(D(s.total)), ZERO);
  const ticket = customer.sales.length ? money(total.dividedBy(customer.sales.length)) : ZERO;
  const open = customer.financeEntries.reduce((a, e) => a.plus(D(e.amount).minus(D(e.paidAmount))), ZERO);

  if (editar === "1" && can(user.permissions, "customers.update")) {
    return (
      <div>
        <PageHeader title="Editar cliente" subtitle={customer.name} />
        <CustomerForm
          customer={{
            id: customer.id, name: customer.name, legalName: customer.legalName, taxId: customer.taxId,
            type: customer.type, phone: customer.phone, whatsapp: customer.whatsapp, email: customer.email,
            city: customer.city, state: customer.state, address: customer.address,
            creditLimit: D(customer.creditLimit).toFixed(2),
            paymentTerms: customer.paymentTerms,
            defaultDiscountPct: D(customer.defaultDiscountPct).toString(),
            notes: customer.notes, active: customer.active,
          }}
          canDelete={can(user.permissions, "customers.delete")}
          saved={ok === "1"}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={customer.name}
        subtitle={`${CUSTOMER_TYPE_LABELS[customer.type]}${customer.city ? ` · ${customer.city}` : ""}`}
        action={can(user.permissions, "customers.update") ? (
          <Link href={`/clientes/${customer.id}?editar=1`} className="btn-ghost btn-sm">Editar</Link>
        ) : null}
      />

      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="Total comprado" value={brl(money(total))} hint={`${customer.sales.length} venda(s)`} />
        <StatCard label="Ticket médio" value={brl(ticket)} />
        <StatCard label="Em aberto" value={brl(money(open))} tone={open.greaterThan(0) ? "red" : "green"} />
      </div>

      {(customer.whatsapp || customer.phone) && (
        <div className="mt-3 flex gap-2">
          {customer.whatsapp && (
            <a
              href={`https://wa.me/55${customer.whatsapp.replace(/\D/g, "")}`}
              target="_blank" rel="noopener noreferrer"
              className="btn-primary btn-sm flex-1"
            >
              💬 WhatsApp
            </a>
          )}
          {customer.phone && (
            <a href={`tel:${customer.phone.replace(/\D/g, "")}`} className="btn-ghost btn-sm flex-1">📞 Ligar</a>
          )}
          {can(user.permissions, "sales.create") && (
            <Link href="/vendas/nova" className="btn-banana btn-sm flex-1">🛒 Vender</Link>
          )}
        </div>
      )}

      {customer.financeEntries.length > 0 && (
        <>
          <SectionTitle>Contas em aberto</SectionTitle>
          <Card pad={false}>
            {customer.financeEntries.map((entry) => {
              const late = entry.dueDate < new Date();
              return (
                <div key={entry.id} className="row">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-800">{entry.description}</p>
                    <p className={`text-xs ${late ? "font-semibold text-red-600" : "text-ink-500"}`}>
                      Vence {date(entry.dueDate)} ({relativeDays(entry.dueDate)})
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{brl(D(entry.amount).minus(D(entry.paidAmount)))}</p>
                    <p className="text-xs text-ink-500">{FINANCE_STATUS_LABELS[entry.status]}</p>
                  </div>
                </div>
              );
            })}
          </Card>
        </>
      )}

      <SectionTitle>Histórico de compras</SectionTitle>
      {customer.sales.length === 0 ? (
        <Card><p className="text-sm text-ink-500">Este cliente ainda não realizou compras.</p></Card>
      ) : (
        <Card pad={false}>
          {customer.sales.map((sale) => (
            <Link key={sale.id} href={`/vendas/${sale.id}`} className="block active:bg-ink-50">
              <div className="row">
                <div>
                  <p className="font-medium text-ink-800">{sale.number}</p>
                  <p className="text-xs text-ink-500">{date(sale.soldAt)}</p>
                </div>
                <span className="font-semibold tabular-nums">{brl(sale.total)}</span>
              </div>
            </Link>
          ))}
        </Card>
      )}

      <SectionTitle>Dados cadastrais</SectionTitle>
      <Card pad={false}>
        {customer.taxId && <div className="row"><span className="text-ink-500">CPF/CNPJ</span><span className="font-semibold">{customer.taxId}</span></div>}
        {customer.phone && <div className="row"><span className="text-ink-500">Telefone</span><span className="font-semibold">{customer.phone}</span></div>}
        {customer.email && <div className="row"><span className="text-ink-500">E-mail</span><span className="font-semibold">{customer.email}</span></div>}
        {customer.address && <div className="row"><span className="text-ink-500">Endereço</span><span className="max-w-[60%] text-right font-medium">{customer.address}</span></div>}
        <div className="row"><span className="text-ink-500">Limite de crédito</span><span className="font-semibold">{brl(customer.creditLimit)}</span></div>
        {customer.paymentTerms && <div className="row"><span className="text-ink-500">Condição de pagamento</span><span className="font-semibold">{customer.paymentTerms}</span></div>}
        {customer.notes && <div className="row"><span className="text-ink-500">Observações</span><span className="max-w-[60%] text-right">{customer.notes}</span></div>}
      </Card>
    </div>
  );
}
