import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { D } from "@/lib/money";
import { brl, datetime, num } from "@/lib/format";
import { INVENTORY_STATUS_LABELS, UNIT_LABELS } from "@/lib/defaults";
import {
  cancelInventory, closeInventory, inventoryLines, setCount, summarize,
  type InventoryLine,
} from "@/logic/inventories";
import {
  Badge, Busy, Card, DocumentPicker, Field, Message, PageHeader, SectionTitle,
  Spinner, StatCard,
} from "@/components/ui";

export default function InventoryDetailPage() {
  const { id } = useParams();
  const [lines, setLines] = useState<InventoryLine[] | null>(null);
  const [filter, setFilter] = useState<"todos" | "faltam" | "divergentes">("todos");
  const [reason, setReason] = useState("");
  const [document, setDocument] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const inventory = useLiveQuery(
    async () => (id ? db.inventories.get(id) : undefined),
    [id],
  );

  useEffect(() => {
    if (!inventory) return;
    inventoryLines(inventory).then(setLines);
  }, [inventory]);

  const resumo = useMemo(() => (lines ? summarize(lines) : null), [lines]);

  const visible = useMemo(() => {
    if (!lines) return [];
    if (filter === "faltam") return lines.filter((l) => !l.counted);
    if (filter === "divergentes") return lines.filter((l) => l.counted && !l.diffQty.isZero());
    return lines;
  }, [lines, filter]);

  if (inventory === undefined) return <Spinner />;
  if (!inventory) return <p className="py-8 text-center text-sm text-ink-500">Inventário não encontrado.</p>;

  const aberto = inventory.status === "OPEN";

  async function anotar(productId: string, value: string) {
    if (!id) return;
    await setCount(id, productId, value === "" ? null : value);
  }

  async function fechar() {
    if (!id) return;
    setError(null); setSuccess(null);
    setBusy(true);
    try {
      const resultado = await closeInventory({ inventoryId: id, reason, document });
      setSuccess(
        `Inventário fechado: ${resultado.withDiff} divergência(s), ` +
        `diferença de ${brl(resultado.diffValue)}. O estoque foi acertado.`,
      );
      setReason(""); setDocument(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancelar() {
    if (!id) return;
    const motivo = window.prompt("Motivo do cancelamento da contagem:");
    if (motivo === null) return;
    try {
      await cancelInventory(id, motivo || "Sem motivo informado");
      setSuccess("Contagem cancelada. O estoque não foi alterado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <PageHeader title={`Inventário ${inventory.code}`}
        subtitle={datetime(inventory.startedAt)}
        action={<Badge tone={inventory.status === "CLOSED" ? "green" : aberto ? "yellow" : "neutral"}>
          {INVENTORY_STATUS_LABELS[inventory.status]}
        </Badge>} />

      <div className="space-y-4">
        <Message error={error} success={success} />

        {resumo && (
          <div className="grid grid-cols-3 gap-2.5">
            <StatCard label="Contados" value={`${resumo.counted}/${resumo.total}`} />
            <StatCard label="Divergentes" value={String(resumo.withDiff)}
              tone={resumo.withDiff ? "red" : "green"} />
            <StatCard label="Diferença" value={brl(resumo.diffValue)}
              tone={resumo.diffValue.isNegative() ? "red" : "green"} />
          </div>
        )}

        {aberto && (
          <div className="flex gap-1.5">
            {([
              ["todos", "Todos"], ["faltam", "Faltam contar"], ["divergentes", "Divergentes"],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFilter(value)}
                className={`flex-1 rounded-lg px-2 py-2 text-sm font-semibold transition ${
                  filter === value ? "bg-leaf-600 text-white"
                    : "border border-[var(--border)] bg-white text-ink-600"
                }`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {!lines ? <Spinner /> : (
          <Card pad={false} className="divide-y divide-[var(--border)]">
            {visible.map((line) => (
              <div key={line.item.productId} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">
                      {line.product?.name ?? "Produto removido"}
                    </p>
                    <p className="text-xs text-ink-500">
                      Sistema: {num(D(line.item.systemQty), 3)}{" "}
                      {UNIT_LABELS[line.product?.unit ?? "UN"] ?? ""} ·{" "}
                      custo {brl(line.item.unitCost)}
                    </p>
                  </div>
                  {line.counted && !line.diffQty.isZero() && (
                    <span className={`shrink-0 text-right text-sm font-bold tabular-nums ${
                      line.diffQty.isNegative() ? "text-red-600" : "text-leaf-700"
                    }`}>
                      {line.diffQty.isNegative() ? "" : "+"}{num(line.diffQty, 3)}
                      <span className="block text-xs font-medium text-ink-500">
                        {brl(line.diffValue)}
                      </span>
                    </span>
                  )}
                </div>

                {aberto ? (
                  <input
                    className="input mt-2 !min-h-[2.75rem]"
                    inputMode="decimal"
                    aria-label={`Contagem de ${line.product?.name ?? "produto"}`}
                    placeholder="Quantidade contada"
                    defaultValue={line.item.countedQty ?? ""}
                    onBlur={(e) => void anotar(line.item.productId, e.target.value.trim())}
                  />
                ) : (
                  <p className="mt-1 text-sm text-ink-600">
                    Contado: {line.counted ? num(D(line.item.countedQty), 3) : "não contado"}
                  </p>
                )}
              </div>
            ))}
            {visible.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-ink-500">
                Nada nesta lista.
              </p>
            )}
          </Card>
        )}

        {aberto && (
          <>
            <SectionTitle>Fechar a contagem</SectionTitle>
            <Card className="space-y-3">
              <p className="text-sm text-ink-600">
                Ao fechar, o saldo dos itens contados passa a ser o saldo contado, e cada
                diferença vira um movimento de inventário no histórico. Itens não contados
                ficam como estão.
              </p>
              <Field label="Motivo / responsável pela contagem" required>
                <input className="input" value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex.: contagem mensal conferida por Maria" />
              </Field>
              <DocumentPicker file={document} onPick={setDocument}
                label="Documento de autorização"
                hint="Foto da planilha assinada ou autorização do responsável." />
              <Busy busy={busy} onClick={() => void fechar()}>
                Fechar e acertar o estoque
              </Busy>
              <button type="button" onClick={() => void cancelar()}
                className="btn-ghost w-full !text-red-600">
                Cancelar contagem
              </button>
            </Card>
          </>
        )}

        {inventory.status === "CLOSED" && (
          <Card className="space-y-2">
            <p className="text-sm text-ink-600">
              Fechado em {datetime(inventory.finishedAt)}.
              {inventory.note ? ` Motivo: ${inventory.note}` : ""}
            </p>
            <Link to="/relatorios/inventarios" className="btn-ghost w-full">
              Ver no relatório de inventários
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
