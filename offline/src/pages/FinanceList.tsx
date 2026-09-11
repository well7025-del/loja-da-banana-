import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import type { FinanceDirection, PaymentMethod } from "@/data/types";
import { D, ZERO, money } from "@/lib/money";
import { brl, date } from "@/lib/format";
import { FINANCE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/defaults";
import { registerPayment } from "@/logic/finance";
import { Busy, Card, Field, Message, PageHeader, Spinner, StatCard } from "@/components/ui";

export default function FinanceListPage({ direction }: { direction: FinanceDirection }) {
  const [filtro, setFiltro] = useState("abertas");
  const [openId, setOpenId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("PIX");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const [entries, customers] = await Promise.all([db.finance.toArray(), db.customers.toArray()]);
    const byId = new Map(customers.map((c) => [c.id, c]));
    const now = new Date().toISOString();

    const rows = entries
      .filter((e) => e.direction === direction && !e.deletedAt)
      .filter((e) => {
        if (filtro === "vencidas") {
          return (e.status === "OPEN" || e.status === "PARTIAL") && e.dueDate < now;
        }
        if (filtro === "quitadas") return e.status === "PAID";
        return e.status === "OPEN" || e.status === "PARTIAL";
      })
      .map((e) => ({
        ...e,
        partner: (e.customerId ? byId.get(e.customerId)?.name : null) ??
          e.supplierName ?? e.category ?? "—",
        outstanding: money(D(e.amount).minus(D(e.paidAmount))),
        late: (e.status === "OPEN" || e.status === "PARTIAL") && e.dueDate < now,
      }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return {
      rows,
      total: money(rows.reduce((a, e) => a.plus(e.outstanding), ZERO)),
      overdue: money(rows.filter((e) => e.late).reduce((a, e) => a.plus(e.outstanding), ZERO)),
    };
  }, [direction, filtro]);

  async function baixar(entryId: string) {
    setError(null); setSuccess(null); setBusy(true);
    try {
      await registerPayment({ entryId, amount: amount || undefined, method });
      setSuccess(direction === "RECEIVABLE" ? "Recebimento registrado." : "Pagamento registrado.");
      setAmount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const isIn = direction === "RECEIVABLE";

  return (
    <div>
      <PageHeader
        title={isIn ? "Contas a receber" : "Contas a pagar"}
        subtitle="Toque em um título para dar baixa"
        action={<Link to={`/financeiro/novo?tipo=${direction}`} className="btn-banana btn-sm">+ Lançar</Link>}
      />

      {(error || success) && <div className="mb-3"><Message error={error} success={success} /></div>}

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Em aberto" value={brl(data?.total ?? 0)}
          hint={`${data?.rows.length ?? 0} título(s)`} />
        <StatCard label="Vencido" value={brl(data?.overdue ?? 0)}
          tone={D(data?.overdue ?? 0).greaterThan(0) ? "red" : "green"} />
      </div>

      <div className="mt-3 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[{ value: "abertas", label: "Em aberto" },
          { value: "vencidas", label: "Vencidas" },
          { value: "quitadas", label: "Quitadas" }].map((o) => (
            <button key={o.value} type="button" onClick={() => setFiltro(o.value)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ${
                filtro === o.value ? "bg-leaf-600 text-white" : "border border-[var(--border)] bg-white text-ink-600"
              }`}>{o.label}</button>
          ))}
      </div>

      <div className="mt-3 space-y-2">
        {!data ? <Spinner /> : data.rows.length === 0 ? (
          <Card><p className="text-sm text-ink-500">Nenhum título com esse filtro.</p></Card>
        ) : data.rows.map((entry) => (
          <Card key={entry.id} pad={false}>
            <button type="button" className="w-full px-4 py-3.5 text-left active:bg-ink-50"
              onClick={() => {
                setOpenId(openId === entry.id ? null : entry.id);
                setAmount(entry.outstanding.toFixed(2));
                setError(null); setSuccess(null);
              }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">{entry.description}</p>
                  <p className={`mt-0.5 truncate text-xs ${
                    entry.late ? "font-semibold text-red-600" : "text-ink-500"
                  }`}>
                    {entry.partner} · vence {date(entry.dueDate)}{entry.late && " · VENCIDO"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`font-bold tabular-nums ${isIn ? "text-leaf-700" : "text-red-600"}`}>
                    {brl(entry.outstanding)}
                  </p>
                  <p className="text-xs text-ink-500">{FINANCE_STATUS_LABELS[entry.status]}</p>
                </div>
              </div>
            </button>

            {openId === entry.id && entry.status !== "PAID" && entry.status !== "CANCELLED" && (
              <div className="space-y-3 border-t border-[var(--border)] p-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Valor" hint={`Saldo: ${brl(entry.outstanding)}`}>
                    <input className="input" inputMode="decimal" value={amount}
                      onChange={(e) => setAmount(e.target.value)} />
                  </Field>
                  <Field label="Forma">
                    <select className="input" value={method}
                      onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                      {Object.entries(PAYMENT_METHOD_LABELS)
                        .filter(([v]) => v !== "TERM")
                        .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                </div>
                <Busy busy={busy} onClick={() => void baixar(entry.id)}>
                  {isIn ? "Confirmar recebimento" : "Confirmar pagamento"}
                </Busy>
              </div>
            )}

            {openId === entry.id && entry.status === "PAID" && (
              <div className="border-t border-[var(--border)] px-4 py-3">
                <p className="text-sm font-semibold text-leaf-700">
                  Título quitado — {brl(entry.amount)}.
                </p>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
