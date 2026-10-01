/**
 * Leitura de extratos bancários e de maquininha.
 *
 * Não existe um formato único: cada banco exporta o CSV do seu jeito e alguns
 * oferecem OFX. Aqui o arquivo é lido por heurística — descobrir o separador,
 * achar a linha de cabeçalho e identificar as colunas de data, histórico e
 * valor. O que não for reconhecido é informado, em vez de entrar errado.
 */

export type RawStatementLine = {
  date: string;
  description: string;
  /** Positivo = crédito (entrou), negativo = débito (saiu). */
  amount: number;
};

export type ParseResult = {
  format: "OFX" | "CSV";
  lines: RawStatementLine[];
  /** Linhas que não deu para entender — mostradas ao usuário. */
  skipped: number;
};

export class StatementFormatError extends Error {}

export function parseStatement(text: string, fileName = ""): ParseResult {
  const content = text.replace(/^﻿/, "");
  const looksOfx = /<STMTTRN>/i.test(content) || /\.ofx$/i.test(fileName);
  return looksOfx ? parseOfx(content) : parseCsv(content);
}

// ---------------------------------------------------------------------------
// OFX
// ---------------------------------------------------------------------------

function parseOfx(content: string): ParseResult {
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  if (!blocks.length) {
    throw new StatementFormatError(
      "O arquivo parece OFX mas não tem lançamentos (<STMTTRN>) dentro.",
    );
  }

  const lines: RawStatementLine[] = [];
  let skipped = 0;

  for (const block of blocks) {
    const posted = tag(block, "DTPOSTED");
    const amount = Number(tag(block, "TRNAMT")?.replace(",", "."));
    const memo = tag(block, "MEMO") ?? tag(block, "NAME") ?? "Lançamento";

    const date = ofxDate(posted);
    if (!date || !Number.isFinite(amount)) { skipped++; continue; }
    lines.push({ date, description: clean(memo), amount });
  }

  return { format: "OFX", lines, skipped };
}

function tag(block: string, name: string): string | null {
  // No OFX clássico o valor vai até o fim da linha ou até a próxima tag.
  const match = block.match(new RegExp(`<${name}>([^<\r\n]*)`, "i"));
  return match ? match[1].trim() : null;
}

/** Data do OFX: "20260131", com ou sem hora e fuso em colchetes. */
function ofxDate(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  return isoDate(year, month, day);
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const DATE_HEADERS = ["data", "date", "datalancamento", "datamovimento", "dataoperacao", "dtposted"];
const TEXT_HEADERS = [
  "historico", "descricao", "lancamento", "memo", "detalhe", "operacao",
  "estabelecimento", "name", "description", "titulo",
];
const VALUE_HEADERS = ["valor", "amount", "montante", "valorrs", "valorbrl", "trnamt"];
const CREDIT_HEADERS = ["credito", "entrada", "recebido", "credit"];
const DEBIT_HEADERS = ["debito", "saida", "pago", "debit"];
const TYPE_HEADERS = ["tipo", "dc", "debitocredito", "natureza"];

function parseCsv(content: string): ParseResult {
  const rows = content.split(/\r?\n/).filter((row) => row.trim().length > 0);
  if (!rows.length) throw new StatementFormatError("O arquivo está vazio.");

  const delimiter = detectDelimiter(rows);
  const table = rows.map((row) => splitRow(row, delimiter));

  const headerIndex = table.findIndex((cells) => looksLikeHeader(cells));
  if (headerIndex < 0) {
    throw new StatementFormatError(
      "Não encontrei o cabeçalho do extrato. O arquivo precisa ter uma linha com " +
      "os nomes das colunas (data, histórico e valor).",
    );
  }

  const header = table[headerIndex].map(normalizeHeader);
  const dateCol = findColumn(header, DATE_HEADERS);
  const textCol = findColumn(header, TEXT_HEADERS);
  const valueCol = findColumn(header, VALUE_HEADERS);
  const creditCol = findColumn(header, CREDIT_HEADERS);
  const debitCol = findColumn(header, DEBIT_HEADERS);
  const typeCol = findColumn(header, TYPE_HEADERS);

  if (dateCol < 0) throw new StatementFormatError("O extrato não tem uma coluna de data.");
  if (valueCol < 0 && creditCol < 0 && debitCol < 0) {
    throw new StatementFormatError("O extrato não tem uma coluna de valor.");
  }

  const lines: RawStatementLine[] = [];
  let skipped = 0;

  for (let i = headerIndex + 1; i < table.length; i++) {
    const cells = table[i];
    const date = brDate(cells[dateCol]);
    if (!date) { skipped++; continue; }

    let amount: number | null = null;
    if (valueCol >= 0) {
      amount = brNumber(cells[valueCol]);
      const type = typeCol >= 0 ? normalizeHeader(cells[typeCol] ?? "") : "";
      if (amount !== null && type) {
        // Colunas "D/C" trazem o valor sempre positivo.
        if (type.startsWith("d")) amount = -Math.abs(amount);
        else if (type.startsWith("c")) amount = Math.abs(amount);
      }
    } else {
      const credit = creditCol >= 0 ? brNumber(cells[creditCol]) ?? 0 : 0;
      const debit = debitCol >= 0 ? brNumber(cells[debitCol]) ?? 0 : 0;
      amount = credit - Math.abs(debit);
    }

    if (amount === null || !Number.isFinite(amount) || amount === 0) { skipped++; continue; }

    const description = textCol >= 0 ? clean(cells[textCol] ?? "") : "Lançamento";
    lines.push({ date, description: description || "Lançamento", amount });
  }

  if (!lines.length) {
    throw new StatementFormatError(
      "Li o arquivo mas não encontrei nenhum lançamento válido. Confira se é o " +
      "extrato certo e se as datas estão no formato dd/mm/aaaa.",
    );
  }

  return { format: "CSV", lines, skipped };
}

function detectDelimiter(rows: string[]): string {
  const sample = rows.slice(0, 15).join("\n");
  const counts = [";", ",", "\t", "|"].map((d) => ({
    d,
    n: sample.split(d).length - 1,
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ";";
}

/** Separa respeitando aspas, que seguram o separador dentro do texto. */
function splitRow(row: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') {
      if (quoted && row[i + 1] === '"') { current += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z]/g, "");
}

function looksLikeHeader(cells: string[]): boolean {
  const normalized = cells.map(normalizeHeader);
  const hasDate = normalized.some((cell) => DATE_HEADERS.includes(cell));
  const hasValue = normalized.some((cell) =>
    VALUE_HEADERS.includes(cell) || CREDIT_HEADERS.includes(cell) || DEBIT_HEADERS.includes(cell));
  return hasDate && hasValue;
}

function findColumn(header: string[], candidates: string[]): number {
  const exact = header.findIndex((cell) => candidates.includes(cell));
  if (exact >= 0) return exact;
  return header.findIndex((cell) => cell && candidates.some((c) => cell.startsWith(c)));
}

/** "1.234,56", "-1234.56", "R$ 12,00", "12,00 D" */
export function brNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  let text = raw.replace(/\s/g, "").replace(/R\$/gi, "");
  if (!text) return null;

  let negative = text.includes("-") || /\(.*\)/.test(text) || /D$/i.test(text);
  if (/C$/i.test(text)) negative = false;
  text = text.replace(/[()DdCc]/g, "").replace(/-/g, "");

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma >= 0 && lastComma > lastDot) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (lastComma >= 0) {
    text = text.replace(/,/g, "");
  }

  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** "31/01/2026", "2026-01-31", "31-01-26" → ISO do meio-dia local. */
export function brDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const br = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (br) {
    const year = Number(br[3]);
    return isoDate(year < 100 ? 2000 + year : year, Number(br[2]), Number(br[1]));
  }

  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return isoDate(Number(compact[1]), Number(compact[2]), Number(compact[3]));

  return null;
}

/** Meio-dia evita que o fuso jogue o lançamento para o dia anterior. */
function isoDate(year: number, month: number, day: number): string | null {
  if (!year || !month || !day || month > 12 || day > 31) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 140);
}
