import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import {
  backupFileName, backupStatus, createBackup, markBackupDone, parseBackup,
  restoreBackup, type BackupStatus,
} from "@/logic/backup";
import { isNativeApp, pickBackupFile, saveBackupFile, shareBackupFile } from "@/logic/bridge";
import { saveSettings } from "@/logic/settings";
import { datetime, int } from "@/lib/format";
import { Busy, Card, Field, Message, PageHeader, SectionTitle, StatCard } from "@/components/ui";

const LABELS: Record<string, string> = {
  products: "Produtos e insumos",
  batches: "Lotes",
  movements: "Movimentações de estoque",
  recipes: "Fichas técnicas",
  productions: "Produções",
  customers: "Clientes",
  sales: "Vendas",
  finance: "Títulos financeiros",
  priceRules: "Regras de desconto",
  settings: "Configurações",
  logs: "Histórico de operações",
};

export default function BackupPage() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const counts = useLiveQuery(async () => {
    const entries = await Promise.all(
      Object.keys(LABELS).map(async (table) => [table, await db.table(table).count()] as const),
    );
    return Object.fromEntries(entries) as Record<string, number>;
  }, []);

  const refresh = () => backupStatus().then(setStatus).catch(() => setStatus(null));
  useEffect(() => { void refresh(); }, []);

  const totalRegistros = counts
    ? Object.entries(counts).filter(([k]) => k !== "logs").reduce((a, [, v]) => a + v, 0)
    : 0;

  async function gerar(compartilhar: boolean) {
    setBusy(compartilhar ? "share" : "save");
    setMessage(null);
    try {
      const backup = await createBackup();
      const conteudo = JSON.stringify(backup, null, 2);
      const nome = backupFileName();
      const outcome = compartilhar
        ? await shareBackupFile(nome, conteudo)
        : await saveBackupFile(nome, conteudo);
      if (outcome.ok) await markBackupDone();
      setMessage({ ok: outcome.ok, text: outcome.message });
      await refresh();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  async function restaurar() {
    setMessage(null);
    let conteudo: string;
    try {
      conteudo = await pickBackupFile();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : String(error) });
      return;
    }

    let backup;
    try {
      backup = parseBackup(conteudo);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : String(error) });
      return;
    }

    const quando = new Date(backup.geradoEm).toLocaleString("pt-BR");
    const registros = Object.entries(backup.resumo ?? {})
      .filter(([k]) => k !== "logs")
      .reduce((a, [, v]) => a + (v as number), 0);

    const confirmado = window.confirm(
      `Restaurar o backup de ${quando}?\n\n` +
      `Ele contém ${registros} registros.\n\n` +
      "ATENÇÃO: tudo o que está no aparelho agora será SUBSTITUÍDO pelo conteúdo do backup. " +
      "Esta ação não pode ser desfeita.",
    );
    if (!confirmado) return;

    setBusy("restore");
    try {
      const resumo = await restoreBackup(backup);
      const total = Object.entries(resumo)
        .filter(([k]) => k !== "logs")
        .reduce((a, [, v]) => a + v, 0);
      setMessage({ ok: true, text: `Backup restaurado: ${total} registros recuperados.` });
      await refresh();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  async function alterarFrequencia(dias: string) {
    await saveSettings({ backupEveryDays: dias } as never);
    await refresh();
  }

  return (
    <div>
      <PageHeader
        title="Backup"
        subtitle="Seus dados ficam neste aparelho — o backup é o que protege você de perdê-los"
      />

      {message && (
        <div className="mb-3">
          <Message error={message.ok ? undefined : message.text} success={message.ok ? message.text : undefined} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard
          label="Último backup"
          value={status?.last ? `há ${status.daysSince} dia(s)` : "nunca"}
          hint={status?.last ? datetime(status.last) : "faça o primeiro agora"}
          tone={status?.overdue ? "red" : "green"}
        />
        <StatCard label="Registros guardados" value={int(totalRegistros)} hint="neste aparelho" />
      </div>

      <SectionTitle>Fazer backup agora</SectionTitle>
      <Card className="space-y-3">
        <p className="text-sm text-ink-600">
          Gera um arquivo com <strong>tudo</strong> o que está no aplicativo. Guarde-o no Google
          Drive: se o celular quebrar ou for trocado, você recupera a operação inteira a partir dele.
        </p>
        <Busy busy={busy === "share"} onClick={() => void gerar(true)} className="btn-primary w-full">
          📤 Salvar no Google Drive
        </Busy>
        <Busy busy={busy === "save"} onClick={() => void gerar(false)} className="btn-ghost w-full">
          💾 {isNativeApp() ? "Salvar em uma pasta do celular" : "Baixar arquivo"}
        </Busy>
        {isNativeApp() && (
          <p className="hint">
            Ao tocar em “Salvar no Google Drive”, escolha <strong>Drive</strong> na lista que o
            Android abrir. Se o Drive não aparecer, instale o aplicativo do Google Drive.
          </p>
        )}
      </Card>

      <SectionTitle>Lembrete</SectionTitle>
      <Card className="space-y-3">
        <Field label="Avisar para fazer backup a cada" hint="O aviso aparece no topo do aplicativo">
          <select
            className="input"
            value={String(status?.everyDays ?? 7)}
            onChange={(e) => void alterarFrequencia(e.target.value)}
          >
            <option value="1">1 dia</option>
            <option value="3">3 dias</option>
            <option value="7">7 dias</option>
            <option value="15">15 dias</option>
            <option value="30">30 dias</option>
          </select>
        </Field>
      </Card>

      <SectionTitle>Restaurar de um arquivo</SectionTitle>
      <Card className="space-y-3">
        <p className="text-sm text-ink-600">
          Use para recuperar os dados em um celular novo ou voltar atrás depois de um problema.
        </p>
        <div className="rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <strong>Substitui tudo.</strong> O conteúdo atual do aplicativo é apagado e trocado pelo
          do arquivo. Faça um backup antes, se houver algo que você ainda não salvou.
        </div>
        <Busy busy={busy === "restore"} onClick={() => void restaurar()} className="btn-ghost w-full">
          📥 Escolher arquivo de backup
        </Busy>
      </Card>

      {counts && (
        <>
          <SectionTitle>O que vai no backup</SectionTitle>
          <Card pad={false}>
            {Object.entries(LABELS).map(([table, label]) => (
              <div key={table} className="row">
                <span className="text-ink-700">{label}</span>
                <span className="font-semibold tabular-nums">{int(counts[table] ?? 0)}</span>
              </div>
            ))}
          </Card>
        </>
      )}

      <Card className="mt-6 bg-ink-50">
        <p className="text-xs leading-relaxed text-ink-600">
          <strong>Duas proteções, não uma.</strong> Além deste arquivo, o Android faz uma cópia
          automática dos dados do aplicativo na sua conta Google, sem você precisar fazer nada —
          ela volta sozinha quando você reinstala o app no mesmo celular ou configura um aparelho
          novo. Essa cópia é limitada e não dá para abrir nem escolher a data: por isso o arquivo
          manual continua valendo a pena, principalmente antes de mexer em algo importante.
        </p>
      </Card>
    </div>
  );
}
