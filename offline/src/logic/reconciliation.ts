import { db, newId, nowIso, registerLog } from "@/data/db";
import type {
  FinanceDirection, FinanceEntry, Sale, Statement, StatementKind, StatementLine,
  StatementSuggestion,
} from "@/data/types";
import { D, ZERO, money, store } from "@/lib/money";
import { brl } from "@/lib/format";
import { BusinessError } from "./codes";
import { getSettings } from "./settings";
import { parseStatement, type RawStatementLine } from "./statementParser";
import type Decimal from "decimal.js";

const DAY = 86400000;
/** Diferença de centavos aceita como "mesmo valor". */
const CENT = 0.005;

// ---------------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------------

export type ImportResult = {
  /** null quando o arquivo só trazia lançamentos já importados antes. */
  statement: Statement | null;
  imported: number;
  duplicates: number;
  skipped: number;
  format: string;
};

/**
 * Lê o arquivo e grava as linhas que ainda não existiam.
 *
 * Reimportar o mesmo extrato é comum (o banco manda o mês inteiro toda vez),
 * então cada linha ganha uma impressão digital de data + valor + histórico e
 * as repetidas são descartadas em silêncio.
 */
export async function importStatement(input: {
  accountId: string;
  kind: StatementKind;
  fileName: string;
  text: string;
}): Promise<ImportResult> {
  const account = await db.accounts.get(input.accountId);
  if (!account) throw new BusinessError("Escolha a conta do extrato.");

  const parsed = parseStatement(input.text, input.fileName);
  const existing = new Set(
    (await db.statementLines.toArray()).map((line) => line.fingerprint),
  );

  const dates = parsed.lines.map((line) => line.date).sort();
  const statement: Statement = {
    id: newId(),
    accountId: input.accountId,
    kind: input.kind,
    fileName: input.fileName,
    importedAt: nowIso(),
    from: dates[0] ?? nowIso(),
    to: dates[dates.length - 1] ?? nowIso(),
    lineCount: 0,
  };

  const novas: StatementLine[] = [];
  let duplicates = 0;

  for (const raw of parsed.lines) {
    const fingerprint = fingerprintOf(input.accountId, raw);
    if (existing.has(fingerprint)) { duplicates++; continue; }
    existing.add(fingerprint);

    novas.push({
      id: newId(),
      statementId: statement.id,
      date: raw.date,
      description: raw.description,
      amount: store(money(raw.amount)),
      fingerprint,
      status: "PENDING",
      matchedSaleIds: [],
      matchedFinanceIds: [],
      feeAmount: null,
      suggestion: suggestFor(raw),
      note: null,
      createdAt: nowIso(),
    });
  }

  statement.lineCount = novas.length;

  // Nada novo: não vale criar um extrato vazio só para o usuário descobrir
  // depois que não havia nada dentro.
  if (!novas.length) {
    return {
      statement: null,
      imported: 0,
      duplicates,
      skipped: parsed.skipped,
      format: parsed.format,
    };
  }

  await db.transaction("rw", [db.statements, db.statementLines, db.logs], async () => {
    await db.statements.add(statement);
    await db.statementLines.bulkAdd(novas);
  });

  await registerLog(
    "IMPORT", "Extrato",
    `Importou ${input.fileName} (${account.name}): ${novas.length} lançamento(s) novo(s)` +
      (duplicates ? `, ${duplicates} repetido(s)` : ""),
    statement.id,
  );

  return {
    statement,
    imported: novas.length,
    duplicates,
    skipped: parsed.skipped,
    format: parsed.format,
  };
}

function fingerprintOf(accountId: string, raw: RawStatementLine): string {
  const description = raw.description
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
  return `${accountId}|${raw.date.slice(0, 10)}|${raw.amount.toFixed(2)}|${description}`;
}

// ---------------------------------------------------------------------------
// Sugestão de classificação
// ---------------------------------------------------------------------------

const KEYWORDS: { match: RegExp; category: string; direction: FinanceDirection }[] = [
  { match: /\b(energia|enel|cemig|light|coelba|celpe|cpfl|equatorial)\b/i, category: "Energia", direction: "PAYABLE" },
  { match: /\b(agua|saneamento|sabesp|caesb|embasa|cagece|compesa)\b/i, category: "Água", direction: "PAYABLE" },
  { match: /\b(aluguel|locacao|imobiliaria)\b/i, category: "Aluguel", direction: "PAYABLE" },
  { match: /\b(folha|salario|salarios|fgts|inss|rescisao|vale)\b/i, category: "Salários", direction: "PAYABLE" },
  { match: /\b(combustivel|posto|shell|ipiranga|petrobras|frete|correios|transportadora|uber|motoboy)\b/i, category: "Transporte", direction: "PAYABLE" },
  { match: /\b(darf|das|simples|iss|icms|imposto|tributo|gps)\b/i, category: "Impostos", direction: "PAYABLE" },
  { match: /\b(manutencao|oficina|conserto|reparo|assistencia)\b/i, category: "Manutenção", direction: "PAYABLE" },
  { match: /\b(marketing|anuncio|ads|publicidade|impulsionamento)\b/i, category: "Marketing", direction: "PAYABLE" },
  { match: /\b(tarifa|cesta|pacote de servicos|iof|juros|anuidade|manutencao de conta)\b/i, category: "Outros", direction: "PAYABLE" },
  { match: /\b(embalagem|embalagens|plastico|rotulo)\b/i, category: "Embalagem", direction: "PAYABLE" },
  { match: /\b(banana|fruta|hortifruti|atacadao|ceasa|mercado)\b/i, category: "Matéria-prima", direction: "PAYABLE" },
  { match: /\b(cielo|stone|getnet|rede|pagseguro|mercado ?pago|sumup|infinitepay)\b/i, category: "Vendas", direction: "RECEIVABLE" },
];

function suggestFor(raw: RawStatementLine): StatementSuggestion {
  const direction: FinanceDirection = raw.amount >= 0 ? "RECEIVABLE" : "PAYABLE";
  const hit = KEYWORDS.find((rule) => rule.match.test(raw.description) && rule.direction === direction);

  return {
    direction,
    category: hit?.category ?? (direction === "RECEIVABLE" ? "Outras receitas" : "Outros"),
    description: raw.description,
  };
}

// ---------------------------------------------------------------------------
// Conferência automática
// ---------------------------------------------------------------------------

export type ReconcileResult = {
  matchedSales: number;
  matchedEntries: number;
  pending: number;
};

/**
 * Compara o extrato com o que já está registrado.
 *
 * A busca acontece em etapas, da mais segura para a mais tolerante: primeiro
 * valor idêntico, depois o fechamento do dia, e só então o repasse de cartão
 * com a taxa descontada. Assim um acerto exato nunca é "roubado" por uma
 * combinação aproximada de outra linha.
 */
export async function reconcileStatement(statementId: string): Promise<ReconcileResult> {
  const statement = await db.statements.get(statementId);
  if (!statement) throw new BusinessError("Extrato não encontrado.");

  const settings = await getSettings();
  const lines = (await db.statementLines.where("statementId").equals(statementId).toArray())
    .filter((line) => line.status === "PENDING")
    .sort((a, b) => a.date.localeCompare(b.date));

  const isCard = statement.kind === "CARD";
  const daysBack = Number(isCard ? settings.cardDaysTolerance : settings.reconcileDaysTolerance) || 3;
  const daysForward = isCard ? 0 : daysBack;
  const feeTolerance = isCard ? Number(settings.cardFeeTolerancePct) || 0 : 0;

  const sales = (await db.sales.toArray())
    .filter((sale) => sale.status === "COMPLETED" && !sale.reconciledAt)
    .sort((a, b) => a.soldAt.localeCompare(b.soldAt));

  const available = new Map(sales.map((sale) => [sale.id, sale]));
  const credits = lines.filter((line) => D(line.amount).greaterThan(0));
  const debits = lines.filter((line) => D(line.amount).lessThan(0));

  const decided = new Map<string, { saleIds: string[]; fee: Decimal }>();

  const windowFor = (line: StatementLine) => {
    const at = new Date(line.date).getTime();
    return {
      from: at - daysBack * DAY - DAY / 2,
      to: at + daysForward * DAY + DAY / 2,
    };
  };

  const candidatesFor = (line: StatementLine): Sale[] => {
    const { from, to } = windowFor(line);
    return [...available.values()].filter((sale) => {
      const at = new Date(sale.soldAt).getTime();
      if (at < from || at > to) return false;
      // Num extrato de maquininha só faz sentido casar venda no cartão.
      if (isCard) return sale.paymentMethod === "CARD";
      return sale.paymentMethod !== "CARD";
    });
  };

  const take = (line: StatementLine, chosen: Sale[], fee: Decimal) => {
    decided.set(line.id, { saleIds: chosen.map((s) => s.id), fee });
    for (const sale of chosen) available.delete(sale.id);
  };

  // 1) Valor idêntico a uma venda.
  for (const line of credits) {
    if (decided.has(line.id)) continue;
    const target = D(line.amount);
    const hit = candidatesFor(line).find((sale) => D(sale.total).minus(target).abs().lessThan(CENT));
    if (hit) take(line, [hit], ZERO);
  }

  // 2) Fechamento do dia: a soma das vendas de um dia bate com o crédito.
  for (const line of credits) {
    if (decided.has(line.id)) continue;
    const target = D(line.amount);
    for (const group of groupByDay(candidatesFor(line))) {
      const total = group.reduce((acc, sale) => acc.plus(D(sale.total)), ZERO);
      if (group.length > 1 && total.minus(target).abs().lessThan(CENT)) {
        take(line, group, ZERO);
        break;
      }
    }
  }

  // 3) Repasse de cartão: o crédito vem menor, já com a taxa descontada.
  if (feeTolerance > 0) {
    for (const line of credits) {
      if (decided.has(line.id)) continue;
      const target = D(line.amount);
      const hit = candidatesFor(line).find((sale) => withinFee(D(sale.total), target, feeTolerance));
      if (hit) take(line, [hit], money(D(hit.total).minus(target)));
    }

    for (const line of credits) {
      if (decided.has(line.id)) continue;
      const target = D(line.amount);
      for (const group of groupByDay(candidatesFor(line))) {
        const total = group.reduce((acc, sale) => acc.plus(D(sale.total)), ZERO);
        if (group.length > 1 && withinFee(total, target, feeTolerance)) {
          take(line, group, money(total.minus(target)));
          break;
        }
      }
    }
  }

  // 4) Duas vendas somadas, quando o cliente pagou junto.
  for (const line of credits) {
    if (decided.has(line.id)) continue;
    const target = D(line.amount);
    const pool = candidatesFor(line).slice(0, 60);
    let found: Sale[] | null = null;

    for (let i = 0; i < pool.length && !found; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        if (D(pool[i].total).plus(D(pool[j].total)).minus(target).abs().lessThan(CENT)) {
          found = [pool[i], pool[j]];
          break;
        }
      }
    }
    if (found) take(line, found, ZERO);
  }

  // 5) Débitos: procura uma conta a pagar já lançada, para não duplicar.
  const openPayables = (await db.finance.toArray()).filter(
    (entry) => !entry.deletedAt && entry.direction === "PAYABLE" &&
      !entry.reconciledAt && entry.status !== "CANCELLED",
  );
  const payableHits = new Map<string, string[]>();

  for (const line of debits) {
    const target = D(line.amount).abs();
    const { from, to } = windowFor(line);
    const hit = openPayables.find((entry) => {
      const due = new Date(entry.dueDate).getTime();
      return due >= from && due <= to && D(entry.amount).minus(target).abs().lessThan(CENT);
    });
    if (hit) {
      payableHits.set(line.id, [hit.id]);
      openPayables.splice(openPayables.indexOf(hit), 1);
    }
  }

  // Grava tudo de uma vez.
  let matchedSales = 0;
  let matchedEntries = 0;

  await db.transaction("rw", [db.statementLines, db.sales, db.finance, db.logs], async () => {
    for (const [lineId, { saleIds, fee }] of decided) {
      const financeIds = (await db.finance.where("saleId").anyOf(saleIds).toArray())
        .filter((entry) => !entry.deletedAt)
        .map((entry) => entry.id);

      await db.statementLines.update(lineId, {
        status: "MATCHED",
        matchedSaleIds: saleIds,
        matchedFinanceIds: financeIds,
        feeAmount: fee.greaterThan(0) ? store(fee) : null,
      });
      for (const saleId of saleIds) {
        await db.sales.update(saleId, { reconciledAt: nowIso() });
      }
      for (const financeId of financeIds) {
        await db.finance.update(financeId, { reconciledAt: nowIso(), statementLineId: lineId });
      }
      matchedSales += saleIds.length;
    }

    for (const [lineId, financeIds] of payableHits) {
      await db.statementLines.update(lineId, {
        status: "MATCHED",
        matchedSaleIds: [],
        matchedFinanceIds: financeIds,
      });
      for (const financeId of financeIds) {
        await db.finance.update(financeId, { reconciledAt: nowIso(), statementLineId: lineId });
      }
      matchedEntries += financeIds.length;
    }
  });

  const pending = await db.statementLines
    .where("statementId").equals(statementId)
    .filter((line) => line.status === "PENDING")
    .count();

  await registerLog(
    "RECONCILE", "Extrato",
    `Conferiu o extrato: ${matchedSales} venda(s) e ${matchedEntries} título(s) casados, ` +
      `${pending} lançamento(s) a classificar`,
    statementId,
  );

  return { matchedSales, matchedEntries, pending };
}

function withinFee(saleTotal: Decimal, credited: Decimal, tolerancePct: number): boolean {
  if (saleTotal.lessThanOrEqualTo(credited)) return false;
  const fee = saleTotal.minus(credited).dividedBy(saleTotal).times(100);
  return fee.lessThanOrEqualTo(tolerancePct);
}

function groupByDay(sales: Sale[]): Sale[][] {
  const days = new Map<string, Sale[]>();
  for (const sale of sales) {
    const key = sale.soldAt.slice(0, 10);
    if (!days.has(key)) days.set(key, []);
    days.get(key)!.push(sale);
  }
  return [...days.values()];
}

// ---------------------------------------------------------------------------
// Aprovação dos pré-lançamentos
// ---------------------------------------------------------------------------

/**
 * Transforma a linha do extrato num lançamento do financeiro, já quitado:
 * o dinheiro de fato entrou ou saiu da conta na data do extrato.
 */
export async function postStatementLine(input: {
  lineId: string;
  direction?: FinanceDirection;
  category?: string;
  description?: string;
}): Promise<FinanceEntry> {
  const line = await db.statementLines.get(input.lineId);
  if (!line) throw new BusinessError("Lançamento não encontrado.");
  if (line.status === "POSTED") throw new BusinessError("Este lançamento já foi aprovado.");
  if (line.status === "MATCHED") {
    throw new BusinessError("Este lançamento já foi casado com uma venda ou título.");
  }

  const statement = await db.statements.get(line.statementId);
  const amount = money(D(line.amount).abs());
  const direction = input.direction ?? line.suggestion?.direction ??
    (D(line.amount).greaterThan(0) ? "RECEIVABLE" : "PAYABLE");

  const entry: FinanceEntry = {
    id: newId(),
    direction,
    status: "PAID",
    description: input.description ?? line.suggestion?.description ?? line.description,
    category: input.category ?? line.suggestion?.category ?? null,
    customerId: null,
    supplierName: null,
    saleId: null,
    amount: store(amount),
    paidAmount: store(amount),
    dueDate: line.date,
    issuedAt: line.date,
    paidAt: line.date,
    installment: 1,
    installments: 1,
    payments: [{
      amount: store(amount),
      method: "TRANSFER",
      paidAt: line.date,
      note: "Importado do extrato",
    }],
    notes: `Extrato: ${line.description}`,
    accountId: statement?.accountId ?? null,
    attachmentId: null,
    reconciledAt: nowIso(),
    statementLineId: line.id,
    deletedAt: null,
  };

  await db.transaction("rw", [db.finance, db.statementLines, db.logs], async () => {
    await db.finance.add(entry);
    await db.statementLines.update(line.id, {
      status: "POSTED",
      matchedFinanceIds: [entry.id],
    });
  });

  await registerLog(
    "CREATE", "Financeiro",
    `Aprovou do extrato: ${entry.description} — ${brl(amount)}`,
    entry.id,
  );
  return entry;
}

export async function postMany(lineIds: string[]): Promise<number> {
  let posted = 0;
  for (const lineId of lineIds) {
    await postStatementLine({ lineId });
    posted++;
  }
  return posted;
}

export async function ignoreLine(lineId: string, note?: string) {
  await db.statementLines.update(lineId, { status: "IGNORED", note: note ?? null });
}

/** Desfaz a conferência de uma linha, soltando a venda para casar de novo. */
export async function unmatchLine(lineId: string) {
  const line = await db.statementLines.get(lineId);
  if (!line) throw new BusinessError("Lançamento não encontrado.");

  await db.transaction("rw", [db.statementLines, db.sales, db.finance], async () => {
    for (const saleId of line.matchedSaleIds) {
      await db.sales.update(saleId, { reconciledAt: null });
    }
    for (const financeId of line.matchedFinanceIds) {
      const entry = await db.finance.get(financeId);
      // Um título criado a partir do extrato é removido junto.
      if (entry?.statementLineId === lineId && line.status === "POSTED") {
        await db.finance.update(financeId, { deletedAt: nowIso(), status: "CANCELLED" });
      } else {
        await db.finance.update(financeId, { reconciledAt: null, statementLineId: null });
      }
    }
    await db.statementLines.update(lineId, {
      status: "PENDING",
      matchedSaleIds: [],
      matchedFinanceIds: [],
      feeAmount: null,
    });
  });
}

export async function deleteStatement(statementId: string) {
  const lines = await db.statementLines.where("statementId").equals(statementId).toArray();
  for (const line of lines) {
    if (line.status !== "PENDING") await unmatchLine(line.id);
  }
  await db.statementLines.where("statementId").equals(statementId).delete();
  await db.statements.delete(statementId);
  await registerLog("DELETE", "Extrato", "Removeu um extrato importado", statementId);
}

/** Garante que exista ao menos uma conta para receber o extrato. */
export async function ensureDefaultAccounts() {
  if ((await db.accounts.count()) > 0) return;
  await db.accounts.bulkAdd([
    { id: newId(), name: "Caixa", kind: "CASH", active: true, createdAt: nowIso() },
    { id: newId(), name: "Conta bancária", kind: "BANK", active: true, createdAt: nowIso() },
    { id: newId(), name: "Maquininha", kind: "CARD", active: true, createdAt: nowIso() },
  ]);
}
