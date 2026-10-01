import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import type { StatementLine } from "@/data/types";
import { D } from "@/lib/money";
import { brl, date as fmtDate } from "@/lib/format";
import {
  DEFAULT_CATEGORIES, STATEMENT_KIND_LABELS, STATEMENT_LINE_STATUS_LABELS,
} from "@/lib/defaults";
import {
  ignoreLine, postStatementLine, reconcileStatement, unmatchLine,
} from "@/logic/reconciliation";
import {
  Badge, Busy, Card, Message, PageHeader, Spinner, StatCard,
} from "@/components/ui";

type Filter = "PENDING" | "MATCHED" | "POSTED" | "IGNORED";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "PENDING", label: "A conferir" },
  { id: "MATCHED", label: "Conferidos" },
  { id: "POSTED", label: "Lançados" },
  { id: "IGNORED", label: "Ignorados" },
];

export default function ReconcileDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    if (!id) return null;
    const statement = await db.statements.get(id);
    if (!statement) return null;
    const [lines, account, sales] = await Promise.all([
      db.statementLines.where("statementId").equals(id).toArray(),
      db.accounts.get(statement.accountId),
      db.sales.toArray(),
    ]);
    return {
      statement,
      account,
      lines: lines.sort((a, b) => a.date.localeCompare(b.date)),
      sales: new Map(sales.map((sale) => [sale.id, sale])),
    };
  }, [id]);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { PENDING: 0, MATCHED: 0, POSTED: 0, IGNORED: 0 };
    for (const line of data?.lines ?? []) result[line.status as Filter]++;
    return result;
  }, [data]);

  const visible = useMemo(
    () => (data?.lines ?? []).filter((line) => line.status === filter),
    [data, filter],
  );

  if (data === undefined) return <Spinner />;
  if (!data) return <p className="py-8 text-center text-sm text-ink-500">Extrato não encontrado.</p>;

  const toggle = (lineId: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(lineId)) next.delete(lineId); else next.add(lineId);
    return next;
  });

  async function aprovar(ids: string[]) {
    setError(null); setNotice(null);
    if (!ids.length) { setError("Marque ao menos um lançamento."); return; }
    setBusy(true);
    try {
      for (const lineId of ids) await postStatementLine({ lineId });
      setNotice(`${ids.length} lançamento(s) aprovados e registrados no financeiro.`);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function reconferir() {
    if (!id) return;
    setBusy(true); setError(null);
    try {
      const resultado = await reconcileStatement(id);
      setNotice(
        `${resultado.matchedSales} venda(s) e ${resultado.matchedEntries} título(s) casados. ` +
        `${resultado.pending} ainda a classificar.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={data.statement.fileName}
        subtitle={`${STATEMENT_KIND_LABELS[data.statement.kind]} · ${data.account?.name ?? ""}`} />

      <div className="space-y-4">
        <Message error={error} success={notice ?? params.get("aviso")} />

        <div className="grid grid-cols-3 gap-2.5">
          <StatCard label="A conferir" value={String(counts.PENDING)}
            tone={counts.PENDING ? "red" : "green"} />
          <StatCard label="Conferidos" value={String(counts.MATCHED)} tone="green" />
          <StatCard label="Lançados" value={String(counts.POSTED)} />
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {FILTERS.map((option) => (
            <button key={option.id} type="button" onClick={() => setFilter(option.id)}
              className={`rounded-lg px-1 py-2 text-xs font-bold leading-tight transition ${
                filter === option.id ? "bg-leaf-600 text-white"
                  : "border border-[var(--border)] bg-white text-ink-600"
              }`}>
              {option.label}
              <span className="block text-[0.65rem] font-semibold opacity-80">
                {counts[option.id]}
              </span>
            </button>
          ))}
        </div>

        {filter === "PENDING" && visible.length > 0 && (
          <Card className="space-y-2.5">
            <p className="text-sm text-ink-600">
              Estes lançamentos não bateram com nenhuma venda. O sistema já sugeriu a
              classificação de cada um — confira e aprove.
            </p>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => setSelected(new Set(visible.map((l) => l.id)))}
                className="btn-ghost flex-1">Marcar todos</button>
              <button type="button" onClick={() => setSelected(new Set())}
                className="btn-ghost flex-1">Limpar</button>
            </div>
            <Busy busy={busy} onClick={() => void aprovar([...selected])}
              disabled={selected.size === 0}>
              Aprovar {selected.size} lançamento(s)
            </Busy>
          </Card>
        )}

        <Card pad={false} className="divide-y divide-[var(--border)]">
          {visible.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              checked={selected.has(line.id)}
              onToggle={() => toggle(line.id)}
              saleNumbers={line.matchedSaleIds
                .map((saleId) => data.sales.get(saleId)?.number)
                .filter(Boolean) as string[]}
              onApprove={() => void aprovar([line.id])}
              onIgnore={async () => { await ignoreLine(line.id); }}
              onUndo={async () => {
                await unmatchLine(line.id);
                setNotice("Conferência desfeita — a linha voltou para \"A conferir\".");
              }}
            />
          ))}
          {visible.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-ink-500">
              {filter === "PENDING"
                ? "Nada pendente: todo o extrato já foi conferido."
                : "Nenhum lançamento nesta situação."}
            </p>
          )}
        </Card>

        <button type="button" onClick={() => void reconferir()} className="btn-ghost w-full">
          🔄 Conferir de novo
        </button>
        <Link to="/relatorios/conciliacao" className="btn-ghost w-full">
          📊 Relatório de conciliação
        </Link>
      </div>
    </div>
  );
}

function LineRow({ line, checked, onToggle, saleNumbers, onApprove, onIgnore, onUndo }: {
  line: StatementLine;
  checked: boolean;
  onToggle: () => void;
  saleNumbers: string[];
  onApprove: () => void;
  onIgnore: () => Promise<void>;
  onUndo: () => Promise<void>;
}) {
  const credit = D(line.amount).greaterThan(0);
  const pending = line.status === "PENDING";

  return (
    <div className="p-3">
      <div className="flex items-start gap-3">
        {pending && (
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 rounded" checked={checked}
            onChange={onToggle} aria-label={`Selecionar ${line.description}`} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink-900">{line.description}</p>
          <p className="text-xs text-ink-500">
            {fmtDate(line.date)} ·{" "}
            <span className={credit ? "text-leaf-700" : "text-red-600"}>
              {credit ? "crédito" : "débito"}
            </span>
            {line.status !== "PENDING" && ` · ${STATEMENT_LINE_STATUS_LABELS[line.status]}`}
          </p>

          {saleNumbers.length > 0 && (
            <p className="mt-1 text-xs font-semibold text-leaf-700">
              Casado com {saleNumbers.join(", ")}
              {line.feeAmount && ` · taxa de ${brl(line.feeAmount)}`}
            </p>
          )}

          {pending && line.suggestion && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={line.suggestion.direction === "RECEIVABLE" ? "green" : "yellow"}>
                {line.suggestion.direction === "RECEIVABLE" ? "Receita" : "Despesa"}
              </Badge>
              <Badge>{line.suggestion.category}</Badge>
              {!DEFAULT_CATEGORIES.some((c) => c.name === line.suggestion?.category) && (
                <span className="text-xs text-ink-400">categoria nova</span>
              )}
            </div>
          )}
        </div>

        <span className={`shrink-0 text-right font-bold tabular-nums ${
          credit ? "text-leaf-700" : "text-ink-900"
        }`}>
          {brl(line.amount)}
        </span>
      </div>

      <div className="mt-2 flex gap-2">
        {pending && (
          <>
            <button type="button" onClick={onApprove}
              className="btn-ghost btn-sm flex-1 !text-leaf-700">Aprovar</button>
            <button type="button" onClick={() => void onIgnore()}
              className="btn-ghost btn-sm flex-1 !text-ink-500">Ignorar</button>
          </>
        )}
        {(line.status === "MATCHED" || line.status === "POSTED" || line.status === "IGNORED") && (
          <button type="button" onClick={() => void onUndo()}
            className="btn-ghost btn-sm flex-1 !text-ink-500">Desfazer</button>
        )}
      </div>
    </div>
  );
}
