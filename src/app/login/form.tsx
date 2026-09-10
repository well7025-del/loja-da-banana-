"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction } from "@/app/actions/auth";
import { Field, FormMessage } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Entrando..." : "Entrar"}
    </button>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(loginAction, {});

  return (
    <form action={action} className="card card-pad space-y-4">
      <FormMessage error={state.error} />
      <Field label="E-mail">
        <input
          name="email"
          type="email"
          className="input"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          placeholder="voce@lojadabanana.com.br"
          required
        />
      </Field>
      <Field label="Senha">
        <input
          name="password"
          type="password"
          className="input"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
      </Field>
      <SubmitButton />
    </form>
  );
}
