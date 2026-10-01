import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import type { StatementKind } from "@/data/types";
import { datetime, date as fmtDate } from "@/lib/format";
import { ACCOUNT_KIND_LABELS, STATEMENT_KIND_LABELS } from "@/lib/defaults";
import { pickFile, readTextSmart } from "@/logic/files";
import {
  deleteStatement, ensureDefaultAccounts, importStatement, reconcileStatement,
} from "@/logic/reconciliation";
import {
  Busy, Card, EmptyState, Field, Message, PageHeader, SectionTitle, Spinner, Tabs,
} from "@/components/ui";

export default function ReconcilePage() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<StatementKind>("BANK");
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { void ensureDefaultAccounts(); }, []);

  const accounts = useLiveQuery(
    async () => (await db.accounts.toArray())
      .filter((a) => a.active)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  const statements = useLiveQuery(
    async () => (await db.statements.toArray())
      .sort((a, b) => b.importedAt.localeCompare(a.importedAt)),
    [],
  );

  // Mesmo motivo do lançamento financeiro: o campo não pode valer "" enquanto
  // mostra a primeira conta da lista.
  const contaPadrao = accounts?.find(
    (a) => (kind === "CARD" ? a.kind === "CARD" : a.kind === "BANK"),
  ) ?? accounts?.[0];
  const contaEscolhida = accountId || contaPadrao?.id || "";

  async function importar() {
    setError(null); setNotice(null);
    if (!contaEscolhida) { setError("Escolha a conta do extrato."); return; }

    setBusy(true);
    try {
      const picked = await pickFile(".csv,.txt,.ofx,text/csv,text/plain,application/x-ofx");
      const text = await readTextSmart(picked.file);

      const resultado = await importStatement({
        accountId: contaEscolhida, kind, fileName: picked.name, text,
      });

      if (!resultado.statement) {
        setNotice(
          `Nada novo neste arquivo: os ${resultado.duplicates} lançamento(s) já tinham ` +
          "sido importados antes. Nenhum lançamento foi duplicado.",
        );
        return;
      }

      const conferencia = await reconcileStatement(resultado.statement.id);
      const aviso =
        `${resultado.imported} lançamento(s) importados do ${resultado.format}. ` +
        `${conferencia.matchedSales} venda(s) conferidas automaticamente, ` +
        `${conferencia.pending} a classificar.` +
        (resultado.duplicates ? ` ${resultado.duplicates} já existiam e foram ignorados.` : "");
      // O aviso viaja na URL: a tela de detalhe é que fica visível no fim.
      navigate(`/conciliacao/${resultado.statement.id}?aviso=${encodeURIComponent(aviso)}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message !== "Nenhum arquivo escolhido.") setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function remover(id: string) {
    if (!window.confirm(
      "Remover este extrato? As conferências feitas por ele são desfeitas e os " +
      "lançamentos criados a partir dele são cancelados.",
    )) return;
    await deleteStatement(id);
    setNotice("Extrato removido.");
  }

  return (
    <div>
      <PageHeader title="Conferir extrato"
        subtitle="O sistema casa os créditos com as vendas e propõe o resto" />

      <div className="space-y-4">
        <Message error={error} success={notice} />

        <Card className="space-y-3">
          <span className="label">Tipo de extrato</span>
          <Tabs value={kind} onChange={setKind} options={[
            { id: "BANK" as StatementKind, label: "Banco / Pix", icon: "🏦" },
            { id: "CARD" as StatementKind, label: "Maquininha", icon: "💳" },
          ]} />
          <p className="text-sm text-ink-600">
            {kind === "BANK"
              ? "Procura o crédito com o mesmo valor da venda, nos dias em volta dela."
              : "O repasse chega depois e já com a taxa descontada — por isso a busca " +
                "aceita um valor menor e um prazo maior."}
          </p>

          <Field label="Conta" required>
            <select className="input" value={contaEscolhida}
              onChange={(e) => setAccountId(e.target.value)}>
              {(accounts ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} — {ACCOUNT_KIND_LABELS[account.kind]}
                </option>
              ))}
            </select>
          </Field>

          <Busy busy={busy} onClick={() => void importar()} disabled={!contaEscolhida}>
            {contaEscolhida ? "📄 Escolher arquivo do extrato" : "Preparando as contas…"}
          </Busy>
          <p className="hint">
            Aceita CSV (o que todo banco exporta) e OFX. Baixe o extrato pelo aplicativo
            do banco e escolha o arquivo aqui. Nada é enviado pela internet.
          </p>
        </Card>

        <SectionTitle>Extratos importados</SectionTitle>
        {!statements ? <Spinner /> : statements.length === 0 ? (
          <EmptyState icon="🏦" title="Nenhum extrato importado"
            detail="Importe o extrato do mês para conferir as vendas contra o que entrou na conta." />
        ) : (
          <Card pad={false}>
            {statements.map((statement) => (
              <div key={statement.id} className="row">
                <Link to={`/conciliacao/${statement.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-900">{statement.fileName}</p>
                  <p className="truncate text-xs text-ink-500">
                    {STATEMENT_KIND_LABELS[statement.kind]} ·{" "}
                    {fmtDate(statement.from)} a {fmtDate(statement.to)} ·{" "}
                    {statement.lineCount} lançamento(s)
                  </p>
                  <p className="text-xs text-ink-400">Importado em {datetime(statement.importedAt)}</p>
                </Link>
                <button type="button" onClick={() => void remover(statement.id)}
                  className="shrink-0 px-2 text-sm font-semibold text-red-600">
                  Remover
                </button>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
