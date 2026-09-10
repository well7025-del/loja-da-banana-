import "server-only";
import { prisma, Prisma } from "./db";
import type { AuditAction } from "@prisma/client";
import type { SessionUser } from "./auth";

type AuditInput = {
  user?: Pick<SessionUser, "id" | "name" | "companyId"> | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
};

/** Trilha de auditoria. Nunca derruba a operação principal. */
export async function audit(
  input: AuditInput,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  try {
    await tx.auditLog.create({
      data: {
        companyId: input.user?.companyId ?? null,
        userId: input.user?.id ?? null,
        userName: input.user?.name ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary ?? null,
        before: input.before ? (JSON.parse(JSON.stringify(input.before)) as Prisma.InputJsonValue) : undefined,
        after: input.after ? (JSON.parse(JSON.stringify(input.after)) as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (error) {
    console.error("[audit] falha ao registrar log", error);
  }
}
