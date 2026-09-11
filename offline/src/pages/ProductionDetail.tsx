import { useState } from "react";
import { useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { D } from "@/lib/money";
import { brl, datetime, num } from "@/lib/format";
import { PRODUCTION_STATUS_LABELS } from "@/lib/defaults";
import { cancelProduction, finishProduction } from "@/logic/production";
import { Badge, Busy, Card, Field, Message, PageHeader, SectionTitle, Spinner, StatCard } from "@/components/ui";

export default function ProductionDetailPage() {
  const { id } = useParams();
  const [producedQty, setProducedQty] = useState("");
  const [lossQty, setLossQty] = useState("");
  const [notes, setNotes] = useState("");
  const [showConsumption, setShowConsumption] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    if (!id) return null;
    const production = await db.productions.get(id);
    if (!production) return null;
    const [product, ingredients, batches] = await Promise.all([
      db.products.get(production.productId),
      db.products.bulkGet(production.consumptions.map((c) => c.productId)),
      db.batches.where("productionId").equals(production.id).toArray(),
    ]);
    const byId = new Map(
      ingredients.filter((p): p is NonNullable<typeof p> => Boolean(p)).map((p) => [p.id, p]),
    );
    return { production, product, byId, batches };
  }, [id]);

  if (data === undefined) return <Spinner />;
  if (!data?.production) return <p className="py-8 text-center text-sm text-ink-500">Ordem não encontrada.</p>;

  const { production, product, byId, batches } = data;
  const finished = production.status === "FINISHED";
  const canFinish = production.status === "PLANNED" || production.status === "IN_PROGRESS";

  async function finalizar() {
    setError(null); setSuccess(null);
    setBusy(true);
    try {
      const result = await finishProduction({
        id: production.id,
        producedQty: producedQty || production.plannedQty,
        lossQty: lossQty || 0,
        notes: notes || undefined,
        consumptions: production.consumptions.map((c) => ({
          productId: c.productId,
          actualQty: overrides[c.productId] ?? c.plannedQty,
        })),
      });
      setSuccess(
        `Produção finalizada. Lote ${result.batchCode} gerado com custo de ` +
        `${brl(result.unitCost)} por ${product?.unit.toLowerCase() ?? "unidade"}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancelar() {
    const reason = window.prompt("Motivo do cancelamento:");
    if (reason === null) return;
    try {
      await cancelProduction(production.id, reason || "Sem motivo informado");
      setSuccess("Produção cancelada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <PageHeader
        title={product?.name ?? "Produção"}
        subtitle={`Ordem ${production.code}`}
        action={
          <Badge tone={finished ? "green" : production.status === "CANCELLED" ? "neutral" : "yellow"}>
            {PRODUCTION_STATUS_LABELS[production.status]}
          </Badge>
        }
      />

      {(error || success) && <div className="mb-3"><Message error={error} success={success} /></div>}

      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label={finished ? "Produzido" : "Planejado"}
          value={num(D(production.producedQty ?? production.plannedQty), 1)}
          hint={product?.unit.toLowerCase()} />
        <StatCard label="Custo real" value={brl(production.totalCost)}
          hint={finished ? `${brl(production.unitCost)}/${product?.unit.toLowerCase()}` : "após finalizar"} />
        <StatCard label="Rendimento"
          value={production.actualYieldPct ? `${num(D(production.actualYieldPct), 1)}%` : "—"}
          hint={production.expectedYieldPct ? `previsto ${num(D(production.expectedYieldPct), 1)}%` : undefined}
          tone={
            production.actualYieldPct && production.expectedYieldPct
              ? D(production.actualYieldPct).lessThan(D(production.expectedYieldPct).times(0.9)) ? "red" : "green"
              : "neutral"
          } />
      </div>

      {canFinish && (
        <>
          <SectionTitle>Finalizar produção</SectionTitle>
          <Card className="space-y-3">
            <Field label={`Quantidade produzida (${product?.unit.toLowerCase()})`} required
              hint={`Planejado: ${num(D(production.plannedQty), 3)}`}>
              <input className="input !text-2xl !font-bold" inputMode="decimal"
                value={producedQty || D(production.plannedQty).toString()}
                onChange={(e) => setProducedQty(e.target.value)} />
            </Field>
            <Field label={`Perdas (${product?.unit.toLowerCase()})`} hint="Produto descartado após a produção">
              <input className="input" inputMode="decimal" value={lossQty}
                onChange={(e) => setLossQty(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Observações">
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Opcional" />
            </Field>

            {production.consumptions.length > 0 && (
              <div>
                <button type="button" className="text-sm font-semibold text-leaf-700"
                  onClick={() => setShowConsumption((v) => !v)}>
                  {showConsumption ? "− Ocultar" : "+ Ajustar"} consumo real de matéria-prima
                </button>
                {showConsumption && (
                  <div className="mt-2 space-y-2 rounded-xl bg-ink-50 p-3">
                    {production.consumptions.map((c) => (
                      <label key={c.productId} className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-ink-700">
                          {byId.get(c.productId)?.name}
                        </span>
                        <input className="input !min-h-[2.5rem] w-28 text-right text-sm" inputMode="decimal"
                          value={overrides[c.productId] ?? D(c.plannedQty).toString()}
                          onChange={(e) =>
                            setOverrides((o) => ({ ...o, [c.productId]: e.target.value }))} />
                        <span className="w-8 text-xs text-ink-500">
                          {byId.get(c.productId)?.unit.toLowerCase()}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-ink-500">
              Ao finalizar, o sistema baixa a matéria-prima, gera o lote, dá entrada no estoque e
              calcula o custo e o rendimento reais.
            </p>

            <Busy busy={busy} onClick={() => void finalizar()}>Finalizar produção</Busy>
          </Card>
        </>
      )}

      <SectionTitle>Matéria-prima {finished ? "consumida" : "prevista"}</SectionTitle>
      <Card pad={false}>
        {production.consumptions.length === 0 && (
          <p className="px-4 py-4 text-sm text-ink-500">
            Esta ordem não tem ficha técnica associada, portanto não há baixa automática de insumos.
          </p>
        )}
        {production.consumptions.map((c) => (
          <div key={c.productId} className="row">
            <div className="min-w-0">
              <p className="truncate font-medium text-ink-800">{byId.get(c.productId)?.name}</p>
              <p className="text-xs text-ink-500">
                Previsto {num(D(c.plannedQty), 3)} {byId.get(c.productId)?.unit.toLowerCase()}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold tabular-nums">
                {num(D(finished ? c.actualQty : c.plannedQty), 3)}
              </p>
              <p className="text-xs text-ink-500">{brl(c.totalCost)}</p>
            </div>
          </div>
        ))}
      </Card>

      {batches.length > 0 && (
        <>
          <SectionTitle>Lote gerado</SectionTitle>
          <Card pad={false}>
            {batches.map((batch) => (
              <div key={batch.id} className="row">
                <div>
                  <p className="font-semibold text-ink-900">{batch.code}</p>
                  <p className="text-xs text-ink-500">
                    Validade {batch.expiresAt ? new Date(batch.expiresAt).toLocaleDateString("pt-BR") : "não informada"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{num(D(batch.availableQty), 1)} disponível</p>
                  <p className="text-xs text-ink-500">de {num(D(batch.producedQty), 1)}</p>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Detalhes</SectionTitle>
      <Card pad={false}>
        <div className="row"><span className="text-ink-500">Criada em</span>
          <span className="font-semibold">{datetime(production.createdAt)}</span></div>
        {production.startedAt && (
          <div className="row"><span className="text-ink-500">Iniciada em</span>
            <span className="font-semibold">{datetime(production.startedAt)}</span></div>
        )}
        {production.finishedAt && (
          <div className="row"><span className="text-ink-500">Finalizada em</span>
            <span className="font-semibold">{datetime(production.finishedAt)}</span></div>
        )}
        {D(production.lossQty).greaterThan(0) && (
          <div className="row"><span className="text-ink-500">Perdas</span>
            <span className="font-semibold text-red-600">
              {num(D(production.lossQty), 3)} {product?.unit.toLowerCase()}
            </span></div>
        )}
        {production.notes && (
          <div className="row"><span className="text-ink-500">Observações</span>
            <span className="max-w-[60%] text-right font-medium">{production.notes}</span></div>
        )}
      </Card>

      {production.status !== "FINISHED" && production.status !== "CANCELLED" && (
        <button type="button" onClick={() => void cancelar()} className="btn-ghost mt-4 w-full !text-red-600">
          Cancelar ordem
        </button>
      )}
    </div>
  );
}
