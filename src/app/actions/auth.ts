"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createSession, destroySession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { type ActionState, str, toActionError } from "./_helpers";

const LOCK_MINUTES = 15;
const MAX_ATTEMPTS = 5;

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  if (!email || !password) return { error: "Informe e-mail e senha." };

  const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });
  const genericError = { error: "E-mail ou senha incorretos." };

  if (!user || !user.active || user.deletedAt) {
    await audit({ action: "LOGIN_FAILED", entity: "User", summary: `Tentativa de login: ${email}` });
    return genericError;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return { error: `Conta bloqueada por tentativas incorretas. Tente novamente em ${minutes} min.` };
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed,
        lockedUntil: failed >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
      },
    });
    await audit({ action: "LOGIN_FAILED", entity: "User", entityId: user.id, summary: `Senha incorreta: ${email}` });
    return failed >= MAX_ATTEMPTS
      ? { error: `Conta bloqueada por ${LOCK_MINUTES} minutos após ${MAX_ATTEMPTS} tentativas.` }
      : genericError;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await createSession(user.id);
  await audit({
    user: { id: user.id, name: user.name, companyId: user.companyId },
    action: "LOGIN", entity: "User", entityId: user.id, summary: "Entrou no sistema",
  });

  redirect(user.mustChangePassword ? "/perfil?trocar=1" : "/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function changePasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const current = str(form, "current");
    const next = str(form, "next");
    const confirm = str(form, "confirm");

    if (next.length < 8) return { error: "A nova senha precisa ter ao menos 8 caracteres." };
    if (next !== confirm) return { error: "A confirmação não confere com a nova senha." };

    const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(current, record.passwordHash))) {
      return { error: "Senha atual incorreta." };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(next), mustChangePassword: false },
    });
    await audit({ user, action: "UPDATE", entity: "User", entityId: user.id, summary: "Alterou a própria senha" });
    return { success: "Senha alterada com sucesso." };
  } catch (error) {
    return toActionError(error);
  }
}
