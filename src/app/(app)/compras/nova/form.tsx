"use client";

import Link from "next/link";
import { ActionForm } from "@/components/forms";
import { Card, Field } from "@/components/ui";
import { ItemsEditor, type PickableProduct } from "@/components/items-editor";
import { createPurchaseAction } from "@/app/actions/purchases";

export function NewPurchaseForm({
  products, suppliers,
}: { products: PickableProduct[]; suppliers: { id: string; name: string }[] }) {
  return (
    <ActionForm action={createPurchaseAction} submitLabel="Registrar compra" pendingLabel="Registrando...">
      <Card className="space-y-3">
        <Field label="Fornecedor" required>
          <select name="supplierId" className="input" required defaultValue="">
            <option value="">Selecione o fornecedor</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {suppliers.length === 0 && (
            <span className="hint">
              Nenhum fornecedor cadastrado.{" "}
              <Link href="/fornecedores/novo" className="font-semibold text-leaf-700 underline">Cadastrar agora</Link>
            </span>
          )}
        </Field>
      </Card>

      <ItemsEditor products={products} mode="purchase" showStock />

      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Frete" hint="Rateado no custo dos itens">
            <input name="freight" className="input" inputMode="decimal" placeholder="0,00" />
          </Field>
          <Field label="Desconto">
            <input name="discount" className="input" inputMode="decimal" placeholder="0,00" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vencimento">
            <input name="dueDate" type="date" className="input" defaultValue={new Date().toISOString().slice(0, 10)} />
          </Field>
          <Field label="Condição de pagamento">
            <input name="paymentTerms" className="input" placeholder="Ex.: 30 dias" />
          </Field>
        </div>
        <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
          <input type="checkbox" name="receiveNow" defaultChecked className="h-5 w-5 rounded" />
          Já recebi a mercadoria (dar entrada no estoque agora)
        </label>
        <Field label="Observações">
          <input name="notes" className="input" placeholder="Opcional" />
        </Field>
      </Card>
    </ActionForm>
  );
}
