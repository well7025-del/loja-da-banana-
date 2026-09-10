"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { FormMessage } from "./ui";
import type { ActionState } from "@/app/actions/_helpers";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

/** Formulário com estado de erro/sucesso e botão que desabilita ao enviar. */
export function ActionForm({
  action, children, submitLabel = "Salvar", pendingLabel, className = "space-y-4",
  buttonClass = "btn-primary w-full", footer, initialMessage,
}: {
  action: Action;
  children: ReactNode | ((state: ActionState) => ReactNode);
  submitLabel?: string;
  pendingLabel?: string;
  className?: string;
  buttonClass?: string;
  footer?: ReactNode;
  initialMessage?: string;
}) {
  const [state, formAction] = useActionState(action, initialMessage ? { success: initialMessage } : {});
  return (
    <form action={formAction} className={className}>
      <FormMessage error={state.error} success={state.success} />
      {typeof children === "function" ? children(state) : children}
      <Submit className={buttonClass} pendingLabel={pendingLabel}>{submitLabel}</Submit>
      {footer}
    </form>
  );
}

export function Submit({
  children, className = "btn-primary w-full", pendingLabel, disabled,
}: { children: ReactNode; className?: string; pendingLabel?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled}>
      {pending ? (pendingLabel ?? "Aguarde...") : children}
    </button>
  );
}

/** Ação destrutiva com confirmação do navegador. */
export function ConfirmForm({
  action, id, extra, label, question, className = "btn-danger btn-sm", reasonPrompt,
}: {
  action: Action; id: string; extra?: Record<string, string>;
  label: string; question: string; className?: string; reasonPrompt?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!confirm(question)) { event.preventDefault(); return; }
        if (reasonPrompt) {
          const reason = prompt(reasonPrompt);
          if (reason === null) { event.preventDefault(); return; }
          const input = event.currentTarget.querySelector<HTMLInputElement>('input[name="reason"]');
          if (input) input.value = reason || "Sem motivo informado";
        }
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      {reasonPrompt && <input type="hidden" name="reason" defaultValue="" />}
      {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Submit className={className} pendingLabel="...">{label}</Submit>
      {state.error && <span className="ml-2 text-xs font-semibold text-red-600">{state.error}</span>}
      {state.success && <span className="ml-2 text-xs font-semibold text-leaf-700">{state.success}</span>}
    </form>
  );
}

/** Botão que dispara uma ação simples (mudança de status etc.). */
export function InlineAction({
  action, fields, label, className = "btn-ghost btn-sm",
}: { action: Action; fields: Record<string, string>; label: string; className?: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="inline">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Submit className={className} pendingLabel="...">{label}</Submit>
      {state.error && <p className="mt-1 text-xs font-semibold text-red-600">{state.error}</p>}
    </form>
  );
}
