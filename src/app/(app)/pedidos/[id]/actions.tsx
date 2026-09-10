"use client";

import { ConfirmForm, InlineAction } from "@/components/forms";
import { cancelOrderAction, changeOrderStatusAction, invoiceOrderAction } from "@/app/actions/sales";

export function OrderActions({
  orderId, status, nextStatus, nextLabel, alreadyInvoiced, canUpdate, canInvoice, canCancel,
}: {
  orderId: string; status: string; nextStatus: string | null; nextLabel: string | null;
  alreadyInvoiced: boolean; canUpdate: boolean; canInvoice: boolean; canCancel: boolean;
}) {
  const closed = status === "CANCELLED" || status === "DELIVERED";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canUpdate && nextStatus && !closed && (
        <InlineAction
          action={changeOrderStatusAction}
          fields={{ id: orderId, status: nextStatus }}
          label={`Avançar para ${nextLabel}`}
          className="btn-primary btn-sm"
        />
      )}
      {canInvoice && !alreadyInvoiced && status !== "CANCELLED" && (
        <ConfirmForm
          action={invoiceOrderAction}
          id={orderId}
          label="Faturar pedido"
          question="Faturar este pedido? Será gerada a venda, com baixa de estoque e financeiro."
          className="btn-banana btn-sm"
        />
      )}
      {canCancel && !closed && (
        <ConfirmForm
          action={cancelOrderAction}
          id={orderId}
          label="Cancelar"
          question="Cancelar este pedido? A reserva de estoque será liberada."
          reasonPrompt="Motivo do cancelamento:"
        />
      )}
    </div>
  );
}
