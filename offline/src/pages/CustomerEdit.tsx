import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, newId, nowIso, registerLog } from "@/data/db";
import type { Customer, CustomerType } from "@/data/types";
import { D, ZERO, money, store } from "@/lib/money";
import { brl, date } from "@/lib/format";
import { CUSTOMER_TYPE_LABELS, FINANCE_STATUS_LABELS } from "@/lib/defaults";
import { Busy, Card, Field, Message, PageHeader, SectionTitle, StatCard } from "@/components/ui";

export default function CustomerEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [existing, setExisting] = useState<Customer | null>(null);
  const [form, setForm] = useState({
    name: "", type: "CONSUMER" as CustomerType, taxId: "", phone: "", whatsapp: "",
    city: "", address: "", creditLimit: "", defaultDiscountPct: "", paymentTerms: "",
    notes: "", active: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    db.customers.get(id).then((customer) => {
      if (!customer) return;
      setExisting(customer);
      setForm({
        name: customer.name, type: customer.type, taxId: customer.taxId ?? "",
        phone: customer.phone ?? "", whatsapp: customer.whatsapp ?? "",
        city: customer.city ?? "", address: customer.address ?? "",
        creditLimit: D(customer.creditLimit).toFixed(2),
        defaultDiscountPct: D(customer.defaultDiscountPct).toString(),
        paymentTerms: customer.paymentTerms ?? "", notes: customer.notes ?? "",
        active: customer.active,
      });
    });
  }, [id]);

  const history = useLiveQuery(async () => {
    if (!id) return null;
    const [sales, finance] = await Promise.all([db.sales.toArray(), db.finance.toArray()]);
    const own = sales
      .filter((s) => s.customerId === id && s.status === "COMPLETED")
      .sort((a, b) => b.soldAt.localeCompare(a.soldAt));
    const open = finance.filter(
      (e) => e.customerId === id && e.direction === "RECEIVABLE" && !e.deletedAt &&
        (e.status === "OPEN" || e.status === "PARTIAL"),
    ).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const total = money(own.reduce((a, s) => a.plus(D(s.total)), ZERO));
    return {
      sales: own.slice(0, 20),
      open,
      total,
      ticket: own.length ? money(total.dividedBy(own.length)) : ZERO,
      outstanding: money(open.reduce((a, e) => a.plus(D(e.amount).minus(D(e.paidAmount))), ZERO)),
    };
  }, [id]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function save() {
    setError(null); setSuccess(null);
    if (!form.name.trim()) { setError("Informe o nome do cliente."); return; }
    setBusy(true);
    try {
      const base = {
        name: form.name.trim(), type: form.type,
        taxId: form.taxId.trim() || null, phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null, city: form.city.trim() || null,
        address: form.address.trim() || null,
        creditLimit: store(form.creditLimit),
        defaultDiscountPct: store(form.defaultDiscountPct),
        paymentTerms: form.paymentTerms.trim() || null,
        notes: form.notes.trim() || null, active: form.active,
        updatedAt: nowIso(),
      };
      if (existing) {
        await db.customers.update(existing.id, base);
        await registerLog("UPDATE", "Cliente", `Atualizou ${base.name}`, existing.id);
        setExisting({ ...existing, ...base });
        setSuccess("Cliente salvo.");
      } else {
        const customer: Customer = { ...base, id: newId(), deletedAt: null, createdAt: nowIso() };
        await db.customers.add(customer);
        await registerLog("CREATE", "Cliente", `Cadastrou ${customer.name}`, customer.id);
        navigate(`/clientes/${customer.id}`, { replace: true });
        setSuccess("Cliente cadastrado.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function inativar() {
    if (!existing) return;
    if (!window.confirm("Inativar este cliente? O histórico de vendas é preservado.")) return;
    await db.customers.update(existing.id, { deletedAt: nowIso(), active: false });
    navigate("/clientes");
  }

  return (
    <div>
      <PageHeader title={existing ? existing.name : "Novo cliente"}
        subtitle={existing ? CUSTOMER_TYPE_LABELS[existing.type] : undefined} />

      {history && existing && (
        <div className="mb-3 grid grid-cols-3 gap-2.5">
          <StatCard label="Total comprado" value={brl(history.total)}
            hint={`${history.sales.length} venda(s)`} />
          <StatCard label="Ticket médio" value={brl(history.ticket)} />
          <StatCard label="Em aberto" value={brl(history.outstanding)}
            tone={history.outstanding.greaterThan(0) ? "red" : "green"} />
        </div>
      )}

      {existing?.whatsapp && (
        <a href={`https://wa.me/55${existing.whatsapp.replace(/\D/g, "")}`}
          target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm mb-3 w-full">
          💬 Abrir WhatsApp
        </a>
      )}

      <div className="space-y-4">
        <Message error={error} success={success} />

        <Card className="space-y-3">
          <Field label="Nome / Razão social" required>
            <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Tipo de cliente">
            <select className="input" value={form.type}
              onChange={(e) => set("type", e.target.value as CustomerType)}>
              {Object.entries(CUSTOMER_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="CPF / CNPJ">
            <input className="input" inputMode="numeric" value={form.taxId}
              onChange={(e) => set("taxId", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefone">
              <input type="tel" className="input" inputMode="tel" value={form.phone}
                onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="WhatsApp">
              <input type="tel" className="input" inputMode="tel" value={form.whatsapp}
                onChange={(e) => set("whatsapp", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cidade">
              <input className="input" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="Endereço">
              <input className="input" value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
          </div>
        </Card>

        <SectionTitle>Condições comerciais</SectionTitle>
        <Card className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Limite de crédito" hint="0 = sem limite">
              <input className="input" inputMode="decimal" value={form.creditLimit}
                onChange={(e) => set("creditLimit", e.target.value)} placeholder="0,00" />
            </Field>
            <Field label="Desconto padrão %">
              <input className="input" inputMode="decimal" value={form.defaultDiscountPct}
                onChange={(e) => set("defaultDiscountPct", e.target.value)} placeholder="0" />
            </Field>
          </div>
          <Field label="Condição de pagamento">
            <input className="input" value={form.paymentTerms}
              onChange={(e) => set("paymentTerms", e.target.value)} placeholder="Ex.: 28 dias, à vista" />
          </Field>
          <Field label="Observações">
            <textarea className="input" rows={3} value={form.notes}
              onChange={(e) => set("notes", e.target.value)} />
          </Field>
          <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
            <input type="checkbox" className="h-5 w-5 rounded" checked={form.active}
              onChange={(e) => set("active", e.target.checked)} />
            Cliente ativo
          </label>
        </Card>

        <Busy busy={busy} onClick={() => void save()}>
          {existing ? "Salvar alterações" : "Cadastrar cliente"}
        </Busy>

        {existing && (
          <button type="button" onClick={() => void inativar()} className="btn-ghost w-full !text-red-600">
            Inativar cliente
          </button>
        )}
      </div>

      {history && history.open.length > 0 && (
        <>
          <SectionTitle>Contas em aberto</SectionTitle>
          <Card pad={false}>
            {history.open.map((entry) => (
              <div key={entry.id} className="row">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-800">{entry.description}</p>
                  <p className={`text-xs ${
                    entry.dueDate < new Date().toISOString() ? "font-semibold text-red-600" : "text-ink-500"
                  }`}>Vence {date(entry.dueDate)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">
                    {brl(D(entry.amount).minus(D(entry.paidAmount)))}
                  </p>
                  <p className="text-xs text-ink-500">{FINANCE_STATUS_LABELS[entry.status]}</p>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      {history && history.sales.length > 0 && (
        <>
          <SectionTitle>Histórico de compras</SectionTitle>
          <Card pad={false}>
            {history.sales.map((sale) => (
              <Link key={sale.id} to={`/vendas/${sale.id}`} className="block active:bg-ink-50">
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
        </>
      )}
    </div>
  );
}
