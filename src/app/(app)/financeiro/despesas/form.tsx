"use client";

import { ActionForm } from "@/components/forms";
import { Card, Field } from "@/components/ui";
import { saveExpenseAction } from "@/app/actions/finance";

export function ExpenseForm({ categories }: { categories: { id: string; name: string }[] }) {
  return (
    <ActionForm action={saveExpenseAction} submitLabel="Registrar despesa">
      <Card className="space-y-3">
        <Field label="Descrição" required>
          <input name="description" className="input" required placeholder="Ex.: Conta de energia" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor" required>
            <input name="amount" className="input !text-xl !font-bold" inputMode="decimal" placeholder="0,00" required />
          </Field>
          <Field label="Data">
            <input name="incurredAt" type="date" className="input" defaultValue={new Date().toISOString().slice(0, 10)} />
          </Field>
        </div>
        <Field label="Categoria">
          <select name="categoryId" className="input" defaultValue="">
            <option value="">Sem categoria</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
          <input type="checkbox" name="generatePayable" defaultChecked className="h-5 w-5 rounded" />
          Gerar conta a pagar (entra no fluxo de caixa)
        </label>
        <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
          <input type="checkbox" name="isFixedOverhead" className="h-5 w-5 rounded" />
          Despesa fixa mensal (rateada na formação de preço)
        </label>
        <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
          <input type="checkbox" name="recurring" className="h-5 w-5 rounded" />
          Despesa recorrente
        </label>
      </Card>
    </ActionForm>
  );
}
