import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import type { FinanceDirection } from "@/data/types";
import { DEFAULT_CATEGORIES } from "@/lib/defaults";
import { createFinanceEntry } from "@/logic/finance";
import { Busy, Card, Field, Message, PageHeader } from "@/components/ui";

export default function FinanceNewPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [direction, setDirection] = useState<FinanceDirection>(
    params.get("tipo") === "RECEIVABLE" ? "RECEIVABLE" : "PAYABLE",
  );
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [installments, setInstallments] = useState("1");
  const [category, setCategory] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customers = useLiveQuery(
    async () => (await db.customers.toArray())
      .filter((c) => !c.deletedAt && c.active)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const categories = DEFAULT_CATEGORIES.filter((c) => c.direction === direction);

  async function submit() {
    setError(null);
    if (!description.trim()) { setError("Informe a descrição do lançamento."); return; }
    setBusy(true);
    try {
      await createFinanceEntry({
        direction, description: description.trim(), amount,
        dueDate: new Date(dueDate).toISOString(),
        category: category || null,
        customerId: direction === "RECEIVABLE" ? customerId || null : null,
        supplierName: direction === "PAYABLE" ? supplierName.trim() || null : null,
        installments: Number(installments || 1),
        notes: notes.trim() || undefined,
      });
      navigate(direction === "PAYABLE" ? "/financeiro/pagar" : "/financeiro/receber");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Novo lançamento" subtitle="Conta a pagar ou a receber" />

      <div className="space-y-4">
        <Message error={error} />

        <Card className="space-y-3">
          <div>
            <span className="label">Tipo</span>
            <div className="grid grid-cols-2 gap-2">
              {(["PAYABLE", "RECEIVABLE"] as const).map((value) => (
                <button key={value} type="button" onClick={() => setDirection(value)}
                  className={`rounded-xl px-3 py-3 text-sm font-bold transition ${
                    direction === value
                      ? value === "PAYABLE" ? "bg-red-600 text-white" : "bg-leaf-600 text-white"
                      : "border border-[var(--border)] bg-white text-ink-600"
                  }`}>
                  {value === "PAYABLE" ? "Conta a pagar" : "Conta a receber"}
                </button>
              ))}
            </div>
          </div>

          <Field label="Descrição" required>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Energia elétrica de setembro" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor total" required>
              <input className="input !text-xl !font-bold" inputMode="decimal" value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </Field>
            <Field label="Parcelas" hint="Mensais">
              <input className="input" inputMode="numeric" value={installments}
                onChange={(e) => setInstallments(e.target.value)} />
            </Field>
          </div>

          <Field label="1º vencimento" required>
            <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>

          <Field label="Categoria">
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Sem categoria</option>
              {categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </Field>

          {direction === "RECEIVABLE" ? (
            <Field label="Cliente">
              <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Não informar</option>
                {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Fornecedor">
              <input className="input" value={supplierName} onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Opcional" />
            </Field>
          )}

          <Field label="Observações">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional" />
          </Field>
        </Card>

        <Busy busy={busy} onClick={() => void submit()}>Registrar lançamento</Busy>
      </div>
    </div>
  );
}
