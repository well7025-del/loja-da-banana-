import { db, TABLES, nowIso, registerLog, type TableName } from "@/data/db";
import { getSettings, saveSettings } from "./settings";
import { BusinessError } from "./codes";

export const BACKUP_FORMAT = "loja-da-banana-backup";
export const BACKUP_VERSION = 1;

export type BackupFile = {
  formato: typeof BACKUP_FORMAT;
  versao: number;
  geradoEm: string;
  aparelho: string;
  resumo: Record<string, number>;
  dados: Record<TableName, unknown[]>;
};

/** Monta o arquivo de backup com todo o conteúdo do banco local. */
export async function createBackup(): Promise<BackupFile> {
  const dados = {} as Record<TableName, unknown[]>;
  const resumo: Record<string, number> = {};

  for (const table of TABLES) {
    const rows = await db.table(table).toArray();
    dados[table] = rows;
    resumo[table] = rows.length;
  }

  return {
    formato: BACKUP_FORMAT,
    versao: BACKUP_VERSION,
    geradoEm: nowIso(),
    aparelho: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : "desconhecido",
    resumo,
    dados,
  };
}

export function backupFileName(date = new Date()): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-") +
    "-" + String(date.getHours()).padStart(2, "0") + String(date.getMinutes()).padStart(2, "0");
  return `loja-da-banana-backup-${stamp}.json`;
}

/** Confere se o arquivo é um backup válido antes de deixar restaurar. */
export function parseBackup(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BusinessError("O arquivo não é um backup válido (não é um JSON).");
  }

  const file = parsed as Partial<BackupFile>;
  if (file?.formato !== BACKUP_FORMAT) {
    throw new BusinessError("Este arquivo não é um backup da Loja da Banana.");
  }
  if (typeof file.versao !== "number" || file.versao > BACKUP_VERSION) {
    throw new BusinessError(
      "Este backup foi gerado por uma versão mais nova do aplicativo. Atualize o app antes de restaurar.",
    );
  }
  if (!file.dados || typeof file.dados !== "object") {
    throw new BusinessError("O backup está incompleto: não contém dados.");
  }
  return file as BackupFile;
}

/**
 * Restauração: SUBSTITUI todo o conteúdo atual pelo do backup.
 * Antes de apagar, guarda uma cópia do estado atual, para o caso de o
 * arquivo estar corrompido no meio da importação.
 */
export async function restoreBackup(file: BackupFile): Promise<Record<string, number>> {
  const seguranca = await createBackup(); // cópia do estado atual, para desfazer
  const resumo: Record<string, number> = {};

  try {
    await db.transaction("rw", TABLES.map((t) => db.table(t)), async () => {
      for (const table of TABLES) {
        await db.table(table).clear();
        const rows = (file.dados[table] ?? []) as Record<string, unknown>[];
        if (rows.length) await db.table(table).bulkAdd(rows);
        resumo[table] = rows.length;
      }
    });
  } catch (error) {
    // Desfaz: volta o que havia antes.
    await db.transaction("rw", TABLES.map((t) => db.table(t)), async () => {
      for (const table of TABLES) {
        await db.table(table).clear();
        const rows = seguranca.dados[table] as Record<string, unknown>[];
        if (rows.length) await db.table(table).bulkAdd(rows);
      }
    });
    throw new BusinessError(
      `Não foi possível restaurar o backup: ${(error as Error).message}. Nada foi alterado.`,
    );
  }

  await registerLog(
    "RESTORE", "Backup",
    `Restaurou o backup de ${new Date(file.geradoEm).toLocaleString("pt-BR")}`,
  );
  await markBackupDone();
  return resumo;
}

// ---------- Controle de "quando foi o último backup" ----------

const LAST_BACKUP = "lastBackupAt";
const BACKUP_EVERY_DAYS = "backupEveryDays";

export async function markBackupDone() {
  await saveSettings({ [LAST_BACKUP]: nowIso() } as never);
}

export async function lastBackupAt(): Promise<Date | null> {
  const settings = (await getSettings()) as unknown as Record<string, string>;
  const value = settings[LAST_BACKUP];
  return value ? new Date(value) : null;
}

export async function backupEveryDays(): Promise<number> {
  const settings = (await getSettings()) as unknown as Record<string, string>;
  return Number(settings[BACKUP_EVERY_DAYS] ?? 7);
}

export type BackupStatus = {
  last: Date | null;
  everyDays: number;
  daysSince: number | null;
  overdue: boolean;
};

/** O app usa isso para lembrar você de fazer o backup. */
export async function backupStatus(): Promise<BackupStatus> {
  const [last, everyDays] = await Promise.all([lastBackupAt(), backupEveryDays()]);
  const daysSince = last
    ? Math.floor((Date.now() - last.getTime()) / 86400000)
    : null;
  return {
    last,
    everyDays,
    daysSince,
    overdue: daysSince === null || daysSince >= everyDays,
  };
}
