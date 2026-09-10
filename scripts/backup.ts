/**
 * Backup do banco de dados.
 *
 *   npm run db:backup
 *
 * Gera backups/loja-da-banana-AAAA-MM-DD-HHMM.sql.gz e mantém os 30 mais
 * recentes. Em produção, agende com cron:  0 2 * * *  npm run db:backup
 */
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { join } from "path";

const KEEP = 30;
const DIR = join(process.cwd(), "backups");

function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida.");

  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-") + "-" + String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");

  const file = join(DIR, `loja-da-banana-${stamp}.sql.gz`);

  console.log("→ Gerando backup...");
  execFileSync("sh", ["-c", `pg_dump --no-owner --no-privileges "${url}" | gzip > "${file}"`], {
    stdio: "inherit",
  });

  const size = (statSync(file).size / 1024 / 1024).toFixed(2);
  console.log(`✅ Backup salvo: ${file} (${size} MB)`);

  const old = readdirSync(DIR)
    .filter((name) => name.startsWith("loja-da-banana-") && name.endsWith(".sql.gz"))
    .sort()
    .slice(0, -KEEP);
  for (const name of old) {
    rmSync(join(DIR, name));
    console.log(`   removido backup antigo: ${name}`);
  }
}

try {
  main();
} catch (error) {
  console.error("💥 Falha no backup:", error instanceof Error ? error.message : error);
  process.exit(1);
}
