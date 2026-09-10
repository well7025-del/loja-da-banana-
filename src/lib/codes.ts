import "server-only";
import { Prisma } from "./db";

export type Sequenced = "batch" | "production" | "sale" | "order" | "purchase";

const PREFIX: Record<Sequenced, string> = {
  batch: "LB",
  production: "OP",
  sale: "VD",
  order: "PD",
  purchase: "CP",
};

/** Coluna que guarda o código sequencial em cada tabela. */
const COLUMN: Record<Sequenced, string> = {
  batch: "code",
  production: "code",
  sale: "number",
  order: "number",
  purchase: "number",
};

const TABLE: Record<Sequenced, string> = {
  batch: "batches",
  production: "production_orders",
  sale: "sales",
  order: "orders",
  purchase: "purchase_orders",
};

export function yyyymmdd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Gera código sequencial diário no formato PREFIXO-AAAAMMDD-000.
 * Executa dentro da transação para evitar colisão entre operações simultâneas.
 */
export async function nextCode(
  tx: Prisma.TransactionClient,
  kind: Sequenced,
  companyId: string,
  when = new Date(),
): Promise<string> {
  const prefix = `${PREFIX[kind]}-${yyyymmdd(when)}`;

  // Serializa a geração do código por empresa+tipo até o fim da transação.
  // Sem isso, duas vendas simultâneas poderiam disputar o mesmo número.
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtext($1))`,
    `seq:${kind}:${companyId}`,
  );

  const rows = await tx.$queryRawUnsafe<{ code: string }[]>(
    `SELECT "${COLUMN[kind]}" AS code FROM "${TABLE[kind]}"
     WHERE "companyId" = $1 AND "${COLUMN[kind]}" LIKE $2
     ORDER BY "${COLUMN[kind]}" DESC LIMIT 1`,
    companyId,
    `${prefix}-%`,
  );

  const last = rows[0]?.code;
  const seq = last ? Number(last.split("-").pop()) + 1 : 1;
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}
