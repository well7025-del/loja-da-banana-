"use client";

import { useState } from "react";
import { ActionForm } from "@/components/forms";
import { Card, Field } from "@/components/ui";
import { ItemsEditor, type DiscountRule, type PickableProduct } from "@/components/items-editor";
import { createOrderAction } from "@/app/actions/sales";
import { PAYMENT_METHOD_LABELS } from "@/lib/defaults";

export function NewOrderForm({
  products, customers, rules,
}: {
  products: PickableProduct[];
  customers: { id: string; name: string; type: string }[];
  rules: DiscountRule[];
}) {
  const [customerId, setCustomerId] = useState("");
  const [channel, setChannel] = useState<"RETAIL" | "WHOLESALE">("WHOLESALE");
  const customer = customers.find((c) => c.id === customerId);

  return (
    <ActionForm action={createOrderAction} submitLabel="Criar pedido" pendingLabel="Criando pedido...">
      <Card className="space-y-3">
        <Field label="Cliente" required>
          <select name="customerId" className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            <option value="">Selecione o cliente</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div>
          <span className="label">Tabela de preço</span>
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
      </Card>

      <ItemsEditor products={products} mode="sale" channel={channel} rules={rules} customerType={customer?.type ?? null} />

      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Entrega prevista">
            <input name="deliveryDate" type="date" className="input" />
          </Field>
          <Field label="Frete">
            <input name="freight" className="input" inputMode="decimal" placeholder="0,00" />
          </Field>
        </div>
        <Field label="Forma de pagamento">
          <select name="paymentMethod" className="input" defaultValue="PIX">
            {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Endereço de entrega">
          <input name="deliveryAddress" className="input" placeholder="Opcional" />
        </Field>
        <Field label="Observações">
          <input name="notes" className="input" placeholder="Opcional" />
        </Field>
      </Card>
    </ActionForm>
  );
}
