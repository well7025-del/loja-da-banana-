"use client";

import { useState } from "react";
import { ActionForm } from "@/components/forms";
import { Card, Field } from "@/components/ui";
import { ItemsEditor, type DiscountRule, type PickableProduct } from "@/components/items-editor";
import { createSaleAction } from "@/app/actions/sales";
import { PAYMENT_METHOD_LABELS } from "@/lib/defaults";

type Customer = { id: string; name: string; type: string; creditLimit: unknown };

const METHODS = ["PIX", "CASH", "CARD", "TRANSFER", "TERM"] as const;

export function NewSaleForm({
  products, customers, rules,
}: { products: PickableProduct[]; customers: Customer[]; rules: DiscountRule[] }) {
  const [channel, setChannel] = useState<"RETAIL" | "WHOLESALE">("RETAIL");
  const [customerId, setCustomerId] = useState("");
  const [method, setMethod] = useState<string>("PIX");

  const customer = customers.find((c) => c.id === customerId);
  const onTerm = method === "TERM";

  return (
    <ActionForm action={createSaleAction} submitLabel="Finalizar venda" pendingLabel="Registrando venda...">
      <Card className="space-y-3">
        <div>
          <span className="label">Tipo de venda</span>
          <div className="grid grid-cols-2 gap-2">
            {(["RETAIL", "WHOLESALE"] as const).map((value) => (
              <button
                key={value} type="button" onClick={() => setChannel(value)}
                className={`rounded-xl px-3 py-3 text-sm font-bold transition ${
                  channel === value ? "bg-leaf-600 text-white" : "border border-[var(--border)] bg-white text-ink-600"
                }`}
              >
                {value === "RETAIL" ? "Varejo" : "Atacado"}
              </button>
            ))}
          </div>
          <input type="hidden" name="channel" value={channel} />
        </div>

        <Field label="Cliente" hint={channel === "RETAIL" ? "Opcional no varejo" : undefined}>
          <select name="customerId" className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Consumidor no balcão</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </Card>

      <ItemsEditor
        products={products}
        mode="sale"
        channel={channel}
        rules={rules}
        customerType={customer?.type ?? null}
      />

      <Card className="space-y-3">
        <div>
          <span className="label">Forma de pagamento</span>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((value) => (
              <button
                key={value} type="button" onClick={() => setMethod(value)}
                className={`rounded-xl px-2 py-3 text-sm font-bold transition ${
                  method === value ? "bg-banana-400 text-[#3A2C00]" : "border border-[var(--border)] bg-white text-ink-600"
                }`}
              >
                {PAYMENT_METHOD_LABELS[value]}
              </button>
            ))}
          </div>
          <input type="hidden" name="paymentMethod" value={method} />
        </div>

        {onTerm && (
          <>
            {!customerId && (
              <p className="rounded-xl bg-red-50 px-3.5 py-3 text-sm font-semibold text-red-700">
                Venda a prazo exige um cliente cadastrado.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="1º vencimento" required>
                <input name="dueDate" type="date" className="input" defaultValue={new Date().toISOString().slice(0, 10)} />
              </Field>
              <Field label="Parcelas">
                <input name="installments" className="input" inputMode="numeric" defaultValue="1" />
              </Field>
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Frete">
            <input name="freight" className="input" inputMode="decimal" placeholder="0,00" />
          </Field>
          <Field label="Desconto extra (R$)">
            <input name="extraDiscount" className="input" inputMode="decimal" placeholder="0,00" />
          </Field>
        </div>

        <Field label="Observações">
          <input name="notes" className="input" placeholder="Opcional" />
        </Field>
      </Card>
    </ActionForm>
  );
}
