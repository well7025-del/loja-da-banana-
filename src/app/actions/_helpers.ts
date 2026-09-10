import "server-only";
import { AuthError } from "@/lib/auth";
import { BusinessError } from "@/server/services/inventory";
import { Prisma } from "@/lib/db";

export type ActionState = { error?: string; success?: string; id?: string };

/** Converte exceções em mensagens claras para o usuário final. */
export function toActionError(error: unknown): ActionState {
  if (error instanceof BusinessError || error instanceof AuthError) {
    return { error: error.message };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = (error.meta?.target as string[] | undefined)?.join(", ") ?? "campo";
      return { error: `Já existe um registro com este valor (${target}).` };
    }
    if (error.code === "P2003") return { error: "Registro vinculado a outros dados e não pode ser alterado." };
    if (error.code === "P2025") return { error: "Registro não encontrado." };
  }
  console.error("[action]", error);
  return { error: "Não foi possível concluir a operação. Tente novamente." };
}

export const str = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};

export const optional = (form: FormData, key: string) => str(form, key) || null;

export const bool = (form: FormData, key: string) => form.get(key) === "on" || form.get(key) === "true";

export const number = (form: FormData, key: string, fallback = 0) => {
  const raw = str(form, key).replace(/\./g, "").replace(",", ".");
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

/** Lê linhas repetidas de um formulário dinâmico (itens de venda, receita etc.). */
export function rows<T extends string>(
  form: FormData,
  prefix: string,
  fields: readonly T[],
): Record<T, string>[] {
  const result: Record<T, string>[] = [];
  let index = 0;
  while (form.has(`${prefix}[${index}][${fields[0]}]`)) {
    const row = {} as Record<T, string>;
    for (const field of fields) {
      const value = form.get(`${prefix}[${index}][${field}]`);
      row[field] = typeof value === "string" ? value.trim() : "";
    }
    result.push(row);
    index++;
  }
  return result;
}
