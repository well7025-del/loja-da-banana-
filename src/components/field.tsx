"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

export function Field({ label, hint, error, children, required }: {
  label?: string; hint?: string; error?: string; children: ReactNode; required?: boolean;
}) {
  // Associação explícita por id. Com o <label> envolvendo o campo, o nome lido
  // por leitores de tela acabava incluindo a dica e até o texto de todas as
  // opções de um <select>.
  const generated = useId();
  const child = isValidElement(children) ? (children as ReactElement<Record<string, unknown>>) : null;
  const id = (child?.props?.id as string | undefined) ?? generated;
  const hintId = hint || required ? `${id}-ajuda` : undefined;

  const control = child
    ? cloneElement(child, {
        id,
        ...(hintId ? { "aria-describedby": hintId } : {}),
        ...(required ? { "aria-required": true } : {}),
      })
    : children;

  return (
    <div className="field">
      {label && <label htmlFor={id} className="label">{label}</label>}
      {control}
      {!error && (hint || required) && (
        <span id={hintId} className="hint">
          {required && <span className="font-semibold text-ink-600">Obrigatório</span>}
          {required && hint ? " · " : ""}
          {hint}
        </span>
      )}
      {error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}
    </div>
  );
}
