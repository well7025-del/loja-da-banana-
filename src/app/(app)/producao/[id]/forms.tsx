"use client";

import { useState } from "react";
import { ActionForm, ConfirmForm, InlineAction } from "@/components/forms";
import { Card, Field } from "@/components/ui";
import { cancelProductionAction, finishProductionAction, startProductionAction } from "@/app/actions/production";

type Consumption = { productId: string; name: string; unit: string; plannedQty: string };

export function FinishProductionForm({
  orderId, unit, plannedQty, consumptions,
}: { orderId: string; unit: string; plannedQty: string; consumptions: Consumption[] }) {
  const [showConsumption, setShowConsumption] = useState(false);

  return (
    <ActionForm action={finishProductionAction} submitLabel="Finalizar produção" pendingLabel="Finalizando...">
      <input type="hidden" name="id" value={orderId} />
      <Card className="space-y-3">
        <Field label={`Quantidade produzida (${unit.toLowerCase()})`} required hint={`Planejado: ${plannedQty}`}>
          <input
            name="producedQty" className="input !text-2xl !font-bold" inputMode="decimal"
            defaultValue={plannedQty} required autoFocus
          />
        </Field>
        <Field label={`Perdas (${unit.toLowerCase()})`} hint="Produto descartado após a produção">
          <input name="lossQty" className="input" inputMode="decimal" placeholder="0" />
        </Field>
        <Field label="Observações">
          <input name="notes" className="input" placeholder="Opcional" />
        </Field>

        {consumptions.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowConsumption((v) => !v)}
              className="text-sm font-semibold text-leaf-700"
            >
              {showConsumption ? "− Ocultar" : "+ Ajustar"} consumo real de matéria-prima
            </button>
            {showConsumption && (
              <div className="mt-2 space-y-2 rounded-xl bg-ink-50 p-3">
                {consumptions.map((c, index) => (
                  <label key={c.productId} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-ink-700">{c.name}</span>
                    <input
                      name={`consumptions[${index}][actualQty]`}
                      className="input !min-h-[2.5rem] w-28 text-right text-sm"
                      inputMode="decimal"
                      defaultValue={c.plannedQty}
                    />
                    <span className="w-8 text-xs text-ink-500">{c.unit.toLowerCase()}</span>
                    <input type="hidden" name={`consumptions[${index}][productId]`} value={c.productId} />
                  </label>
                ))}
              </div>
            )}
            {!showConsumption &&
              consumptions.map((c, index) => (
                <span key={c.productId}>
                  <input type="hidden" name={`consumptions[${index}][productId]`} value={c.productId} />
                  <input type="hidden" name={`consumptions[${index}][actualQty]`} value={c.plannedQty} />
                </span>
              ))}
          </div>
        )}

        <p className="text-xs text-ink-500">
          Ao finalizar, o sistema baixa a matéria-prima, gera o lote, dá entrada no estoque
          e calcula o custo e o rendimento reais.
        </p>
      </Card>
    </ActionForm>
  );
}

export function ProductionActions({
  orderId, status, canStart, canCancel,
}: { orderId: string; status: string; canStart: boolean; canCancel: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canStart && status === "PLANNED" && (
        <InlineAction action={startProductionAction} fields={{ id: orderId }} label="Iniciar produção" className="btn-primary btn-sm" />
      )}
      {canCancel && status !== "FINISHED" && status !== "CANCELLED" && (
        <ConfirmForm
          action={cancelProductionAction}
          id={orderId}
          label="Cancelar ordem"
          question="Cancelar esta ordem de produção?"
          reasonPrompt="Motivo do cancelamento:"
        />
      )}
    </div>
  );
}
