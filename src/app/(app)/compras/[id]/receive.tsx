"use client";

import { ActionForm } from "@/components/forms";
import { Card } from "@/components/ui";
import { receivePurchaseAction } from "@/app/actions/purchases";

type Item = { id: string; name: string; unit: string; pending: string; trackBatches: boolean };

export function ReceivePurchaseForm({ purchaseId, items }: { purchaseId: string; items: Item[] }) {
  return (
    <ActionForm action={receivePurchaseAction} submitLabel="Confirmar recebimento" pendingLabel="Recebendo...">
      <input type="hidden" name="id" value={purchaseId} />
      <Card pad={false} className="divide-y divide-[var(--border)]">
        {items.map((item, index) => (
          <div key={item.id} className="space-y-2 p-3">
            <p className="font-semibold text-ink-900">{item.name}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-ink-500">
                Quantidade recebida ({item.unit.toLowerCase()})
                <input
                  name={`items[${index}][receivedQty]`}
                  className="input mt-1 !min-h-[2.75rem]"
                  inputMode="decimal"
                  defaultValue={item.pending}
                />
              </label>
              {item.trackBatches && (
                <label className="text-xs font-semibold text-ink-500">
                  Validade
                  <input name={`items[${index}][expiresAt]`} type="date" className="input mt-1 !min-h-[2.75rem]" />
                </label>
              )}
            </div>
            {item.trackBatches && (
              <label className="block text-xs font-semibold text-ink-500">
                Lote do fornecedor (opcional)
                <input name={`items[${index}][batchCode]`} className="input mt-1 !min-h-[2.75rem]" placeholder="Gerado automaticamente se vazio" />
              </label>
            )}
            <input type="hidden" name={`items[${index}][purchaseItemId]`} value={item.id} />
          </div>
        ))}
      </Card>
      <p className="text-xs text-ink-500">
        O recebimento gera o lote, atualiza o custo médio (com o frete rateado) e cria a conta a pagar.
      </p>
    </ActionForm>
  );
}
