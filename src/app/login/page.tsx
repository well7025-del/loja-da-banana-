import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./form";

export const metadata = { title: "Entrar — Loja da Banana" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-[var(--bg)] px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-banana-400 text-3xl shadow-card" aria-hidden>
            🍌
          </span>
          <h1 className="text-2xl font-bold text-ink-900">Loja da Banana</h1>
          <p className="mt-1 text-sm text-ink-500">Sistema de gestão da operação</p>
        </div>
        <LoginForm />
        <p className="mt-8 text-center text-xs text-ink-400">
          Acesso restrito. Todas as operações são registradas.
        </p>
      </div>
    </div>
  );
}
