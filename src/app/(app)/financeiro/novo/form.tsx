"use client";

import { useState } from "react";
import { ActionForm } from "@/components/forms";
import { Card, Field } from "@/components/ui";
import { createFinanceEntryAction } from "@/app/actions/finance";

export function FinanceEntryForm({
  defaultDirection, customers, suppliers, categories,
}: {
  defaultDirection: "PAYABLE" | "RECEIVABLE";
  customers: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  categories: { id: string; name: string; direction: string }[];
}) {
  const [direction, setDirection] = useState(defaultDirection);
  const filteredCategories = categories.filter((c) => c.direction === direction);

  return (
    <ActionForm action={createFinanceEntryAction} submitLabel="Registrar lançamento">
      <Card className="space-y-3">
        <div>
          <span className="label">Tipo</span>
          <div className="grid grid-cols-2 gap-2">
            {(["PAYABLE", "RECEIVABLE"] as const).map((value) => (
              <button
                key={value} type="button" onClick={() => setDirection(value)}
                className={`rounded-xl px-3 py-3 text-sm font-bold transition ${
                  direction === value
                    ? value === "PAYABLE" ? "bg-red-600 text-white" : "bg-leaf-600 text-white"
                    : "border border-[var(--border)] bg-white text-ink-600"
                }`}
              >
                {value === "PAYABLE" ? "Conta a pagar" : "Conta a receber"}
              </button>
            ))}
          </div>
          <input type="hidden" name="direction" value={direction} />
        </div>

        <Field label="Descrição" required>
          <input name="description" className="input" required placeholder="Ex.: Energia elétrica de setembro" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor total" required>
            <input name="amount" className="input !text-xl !font-bold" inputMode="decimal" placeholder="0,00" required />
          </Field>
          <Field label="Parcelas" hint="Mensais">
            <input name="installments" className="input" inputMode="numeric" defaultValue="1" />
          </Field>
        </div>

        <Field label="1º vencimento" required>
          <input name="dueDate" type="date" className="input" defaultValue={new Date().toISOString().slice(0, 10)} required />
        </Field>

        <Field label="Categoria">
          <select name="categoryId" className="input" defaultValue="">
            <option value="">Sem categoria</option>
            {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        {direction === "PAYABLE" ? (
          <Field label="Fornecedor">
            <select name="supplierId" className="input" defaultValue="">
              <option value="">Não informar</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Cliente">
            <select name="customerId" className="input" defaultValue="">
              <option value="">Não informar</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}

        <Field label="Observações">
          <input name="notes" className="input" placeholder="Opcional" />
        </Field>
      </Card>
    </ActionForm>
  );
}
