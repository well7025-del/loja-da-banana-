"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({
  children, pendingLabel, className = "btn-primary w-full", disabled,
}: { children: ReactNode; pendingLabel?: string; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled}>
      {pending ? (pendingLabel ?? "Salvando...") : children}
    </button>
  );
}
