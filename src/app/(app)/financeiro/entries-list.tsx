"use client";

import { useState } from "react";
import { ActionForm } from "@/components/forms";
import { Card, Field } from "@/components/ui";
import { registerPaymentAction } from "@/app/actions/finance";
import { FINANCE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/defaults";

export type EntryRow = {
  id: string;
  description: string;
  partner: string;
  amount: string;
  outstanding: string;
  dueDate: string;
  status: string;
  late: boolean;
};

const brl = (v: string) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function EntriesList({
  entries, direction, canPay,
}: { entries: EntryRow[]; direction: "RECEIVABLE" | "PAYABLE"; canPay: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <Card>
        <p className="text-sm text-ink-500">
          Nenhum título {direction === "RECEIVABLE" ? "a receber" : "a pagar"} com esse filtro.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <Card key={entry.id} pad={false}>
          <button
            type="button"
            onClick={() => setOpenId(openId === entry.id ? null : entry.id)}
            className="w-full px-4 py-3.5 text-left active:bg-ink-50"
            aria-expanded={openId === entry.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink-900">{entry.description}</p>
                <p className={`mt-0.5 truncate text-xs ${entry.late ? "font-semibold text-red-600" : "text-ink-500"}`}>
                  {entry.partner} · vence {entry.dueDate}
                  {entry.late && " · VENCIDO"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`font-bold tabular-nums ${direction === "RECEIVABLE" ? "text-leaf-700" : "text-red-600"}`}>
                  {brl(entry.outstanding)}
                </p>
                <p className="text-xs text-ink-500">{FINANCE_STATUS_LABELS[entry.status]}</p>
              </div>
            </div>
          </button>

          {openId === entry.id && (entry.status === "PAID" || entry.status === "CANCELLED") && (
            <div className="border-t border-[var(--border)] px-4 py-3">
              <p className="text-sm font-semibold text-leaf-700">
                {entry.status === "PAID"
                  ? `Título quitado — ${brl(entry.amount)}.`
                  : "Título cancelado."}
              </p>
            </div>
          )}

          {openId === entry.id && canPay && entry.status !== "PAID" && entry.status !== "CANCELLED" && (
            <div className="border-t border-[var(--border)] p-4">
              <ActionForm
                action={registerPaymentAction}
                submitLabel={direction === "RECEIVABLE" ? "Confirmar recebimento" : "Confirmar pagamento"}
                pendingLabel="Registrando..."
                className="space-y-3"
              >
                <input type="hidden" name="entryId" value={entry.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Valor" hint={`Saldo: ${brl(entry.outstanding)}`}>
                    <input name="amount" className="input" inputMode="decimal" defaultValue={Number(entry.outstanding).toFixed(2)} />
                  </Field>
                  <Field label="Forma">
                    <select name="method" className="input" defaultValue="PIX">
                      {Object.entries(PAYMENT_METHOD_LABELS)
                        .filter(([v]) => v !== "TERM")
                        .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Data">
                  <input name="paidAt" type="date" className="input" defaultValue={new Date().toISOString().slice(0, 10)} />
                </Field>
              </ActionForm>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
