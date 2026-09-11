import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { D, ZERO, money } from "@/lib/money";
import { brl, relativeDays } from "@/lib/format";
import { CUSTOMER_TYPE_LABELS } from "@/lib/defaults";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";

export default function CustomersPage() {
  const [query, setQuery] = useState("");

  const rows = useLiveQuery(async () => {
    const [customers, sales, finance] = await Promise.all([
      db.customers.toArray(), db.sales.toArray(), db.finance.toArray(),
    ]);
    const needle = query.trim().toLowerCase();
    const now = new Date().toISOString();

    return customers
      .filter((c) => !c.deletedAt)
      .filter((c) => !needle ||
        c.name.toLowerCase().includes(needle) ||
        (c.taxId ?? "").includes(needle) ||
        (c.phone ?? "").includes(needle) ||
        (c.whatsapp ?? "").includes(needle))
      .map((customer) => {
        const own = sales.filter((s) => s.customerId === customer.id && s.status === "COMPLETED");
        const open = finance.filter(
          (e) => e.customerId === customer.id && e.direction === "RECEIVABLE" &&
            !e.deletedAt && (e.status === "OPEN" || e.status === "PARTIAL"),
        );
        return {
          customer,
          total: money(own.reduce((a, s) => a.plus(D(s.total)), ZERO)),
          last: own.reduce<string | null>((acc, s) => (!acc || s.soldAt > acc ? s.soldAt : acc), null),
          open: money(open.reduce((a, e) => a.plus(D(e.amount).minus(D(e.paidAmount))), ZERO)),
          overdue: open.some((e) => e.dueDate < now),
        };
      })
      .sort((a, b) => a.customer.name.localeCompare(b.customer.name));
  }, [query]);

  return (
    <div>
      <PageHeader title="Clientes" subtitle={rows ? `${rows.length} cadastrado(s)` : undefined}
        action={<Link to="/clientes/novo" className="btn-banana btn-sm">+ Novo</Link>} />

      <input type="search" className="input" value={query} aria-label="Buscar cliente"
        onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome, documento ou telefone" />

      <div className="mt-3">
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon="👥" title="Nenhum cliente cadastrado"
            action={<Link to="/clientes/novo" className="btn-primary btn-sm">Cadastrar cliente</Link>} />
        ) : (
          <Card pad={false}>
            {rows.map(({ customer, total, last, open, overdue }) => (
              <Link key={customer.id} to={`/clientes/${customer.id}`} className="block active:bg-ink-50">
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
                    <p className="font-semibold tabular-nums text-ink-900">{brl(total)}</p>
                    {open.greaterThan(0) && (
                      <p className={`text-xs font-semibold ${overdue ? "text-red-600" : "text-ink-500"}`}>
                        {brl(open)} em aberto
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
