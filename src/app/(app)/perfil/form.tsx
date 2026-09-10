"use client";

import { ActionForm } from "@/components/forms";
import { Card, Field } from "@/components/ui";
import { changePasswordAction } from "@/app/actions/auth";

export function ChangePasswordForm() {
  return (
    <ActionForm action={changePasswordAction} submitLabel="Alterar senha">
      <Card className="space-y-3">
        <Field label="Senha atual" required>
          <input name="current" type="password" className="input" autoComplete="current-password" required />
        </Field>
        <Field label="Nova senha" required hint="Mínimo de 8 caracteres">
          <input name="next" type="password" className="input" autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="Confirmar nova senha" required>
          <input name="confirm" type="password" className="input" autoComplete="new-password" minLength={8} required />
        </Field>
      </Card>
    </ActionForm>
  );
}
