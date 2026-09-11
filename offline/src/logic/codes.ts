import { db } from "@/data/db";

export class BusinessError extends Error {}

const PREFIX = {
  batch: "LB",
  production: "OP",
  sale: "VD",
} as const;

export type Sequenced = keyof typeof PREFIX;

export function yyyymmdd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Código sequencial diário: PREFIXO-AAAAMMDD-000.
 * Chamado sempre dentro de uma transação, para dois registros simultâneos
 * não receberem o mesmo número.
 */
export async function nextCode(kind: Sequenced, when = new Date()): Promise<string> {
  const prefix = `${PREFIX[kind]}-${yyyymmdd(when)}`;

  let last: string | undefined;
  if (kind === "batch") {
    last = (await db.batches.where("code").startsWith(prefix).last())?.code;
  } else if (kind === "production") {
    last = (await db.productions.where("code").startsWith(prefix).last())?.code;
  } else {
    last = (await db.sales.where("number").startsWith(prefix).last())?.number;
  }

  const seq = last ? Number(last.split("-").pop()) + 1 : 1;
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}
