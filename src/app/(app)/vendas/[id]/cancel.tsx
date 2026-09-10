"use client";

import { ConfirmForm } from "@/components/forms";
import { cancelSaleAction } from "@/app/actions/sales";

export function CancelSaleButton({ saleId }: { saleId: string }) {
  return (
    <ConfirmForm
      action={cancelSaleAction}
      id={saleId}
      label="Cancelar venda"
      question="Cancelar esta venda? O estoque será devolvido e os títulos em aberto cancelados."
      reasonPrompt="Motivo do cancelamento:"
    />
  );
}
