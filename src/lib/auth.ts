import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { createHash, randomBytes } from "crypto";
import { prisma } from "./db";
import { can } from "./permissions";

const COOKIE = "lb_session";
const ttlHours = Number(process.env.SESSION_TTL_HOURS ?? 12);

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("AUTH_SECRET ausente ou com menos de 32 caracteres.");
  }
  return new TextEncoder().encode(value);
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 11);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  companyId: string;
  companyName: string;
  roleSlug: string;
  roleName: string;
  permissions: string[];
};

/** Cria a sessão no banco e grava o cookie httpOnly assinado. */
export async function createSession(userId: string) {
  const raw = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
  const h = await headers();

  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(raw),
      expiresAt,
      userAgent: h.get("user-agent")?.slice(0, 250) ?? null,
      ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
    },
  });

  const jwt = await new SignJWT({ sid: raw, uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());

  (await cookies()).set(COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      await prisma.session.updateMany({
        where: { tokenHash: sha256(String(payload.sid)) },
        data: { revokedAt: new Date() },
      });
    } catch {
      /* cookie inválido: apenas limpa */
    }
  }
  store.delete(COOKIE);
}

/** Usuário autenticado da requisição atual (memoizado por request). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const session = await prisma.session.findUnique({
      where: { tokenHash: sha256(String(payload.sid)) },
      include: { user: { include: { role: true, company: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
    const u = session.user;
    if (!u.active || u.deletedAt) return null;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      companyId: u.companyId,
      companyName: u.company.name,
      roleSlug: u.role.slug,
      roleName: u.role.name,
      permissions: u.role.permissions,
    };
  } catch {
    return null;
  }
});

/** Exige autenticação; usado nas server actions e route handlers. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Sessão expirada. Faça login novamente.");
  return user;
}

/** Exige autenticação + permissão. */
export async function requirePermission(permission: string): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.permissions, permission)) {
    throw new AuthError(`Seu perfil (${user.roleName}) não tem permissão para: ${permission}`);
  }
  return user;
}

export class AuthError extends Error {
  status = 401;
}
