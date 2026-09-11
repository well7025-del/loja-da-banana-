import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, newId, nowIso, registerLog } from "@/data/db";
import type { MovementReason, Product } from "@/data/types";
import { D, qty, store } from "@/lib/money";
import { num } from "@/lib/format";
import { MOVEMENT_REASON_LABELS } from "@/lib/defaults";
import { nextCode } from "@/logic/codes";
import { registerAdjustment, registerEntry, registerExit } from "@/logic/inventory";
import { Busy, Card, Field, Message, PageHeader } from "@/components/ui";

type Mode = "entrada" | "saida" | "ajuste";

const TITLES: Record<Mode, { title: string; subtitle: string; button: string }> = {
  entrada: {
    title: "Entrada de estoque",
    subtitle: "Compra, devolução ou saldo inicial",
    button: "Registrar entrada",
  },
  saida: {
    title: "Saída de estoque",
    subtitle: "Perdas e retiradas — sai primeiro o lote que vence antes",
    button: "Registrar saída",
  },
  ajuste: {
    title: "Ajuste de inventário",
    subtitle: "Informe a quantidade contada; o sistema registra a diferença",
    button: "Ajustar saldo",
  },
};

export default function StockMovePage({ mode }: { mode: Mode }) {
  const [params] = useSearchParams();
  const [productId, setProductId] = useState(params.get("produto") ?? "");
  const [search, setSearch] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState<MovementReason>(mode === "entrada" ? "PURCHASE" : "LOSS");
  const [batchCode, setBatchCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const products = useLiveQuery(
    async () => (await db.products.toArray())
      .filter((p) => !p.deletedAt && p.active)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const product = useMemo(
    () => products?.find((p) => p.id === productId) ?? null,
    [products, productId],
  );

  useEffect(() => {
    if (product && mode === "entrada" && !unitCost) {
      setUnitCost(D(product.avgCost).greaterThan(0) ? D(product.avgCost).toFixed(2) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const matches = useMemo(() => {
    if (!products || product) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [products, search, product]);

  async function submit() {
    setError(null); setSuccess(null);
    if (!product) { setError("Selecione o produto."); return; }

    setBusy(true);
    try {
      if (mode === "ajuste") {
        const counted = qty(quantity);
        await db.transaction("rw", [db.products, db.movements, db.logs], async () => {
          const movement = await registerAdjustment({
            productId: product.id, countedQty: counted, note: note || null,
          });
          if (movement) {
            await registerLog("UPDATE", "Estoque",
              `Ajuste em ${product.name}: saldo ${num(counted, 3)} ${product.unit.toLowerCase()}`,
              product.id);
          }
        });
        setSuccess(`Saldo de ${product.name} ajustado para ${num(counted, 3)} ${product.unit.toLowerCase()}.`);
      } else if (mode === "entrada") {
        const amount = qty(quantity);
        if (amount.lessThanOrEqualTo(0)) throw new Error("Informe a quantidade.");
        await db.transaction("rw", [db.products, db.batches, db.movements, db.logs], async () => {
          let batchId: string | null = null;
          if (product.trackBatches) {
            const code = batchCode.trim() || (await nextCode("batch"));
            batchId = newId();
            await db.batches.add({
              id: batchId, productId: product.id, code, origin: "PURCHASE",
              producedQty: store(amount), availableQty: "0",
              unitCost: unitCost ? store(unitCost) : product.avgCost,
              manufacturedAt: nowIso(),
              expiresAt: expiresAt
                ? new Date(expiresAt).toISOString()
                : product.shelfLifeDays
                  ? new Date(Date.now() + product.shelfLifeDays * 86400000).toISOString()
                  : null,
              productionId: null, supplierName: supplier.trim() || null,
              notes: null, createdAt: nowIso(),
            });
          }
          await registerEntry({
            productId: product.id, quantity: amount,
            unitCost: unitCost ? unitCost : undefined,
            reason, batchId, note: note || null,
          });
          await registerLog("CREATE", "Estoque",
            `Entrada de ${num(amount, 3)} ${product.unit.toLowerCase()} de ${product.name}`, product.id);
        });
        setSuccess(`Entrada registrada: ${num(amount, 3)} ${product.unit.toLowerCase()} de ${product.name}.`);
      } else {
        const amount = qty(quantity);
        if (amount.lessThanOrEqualTo(0)) throw new Error("Informe a quantidade.");
        await db.transaction("rw", [db.products, db.batches, db.movements, db.logs], async () => {
          await registerExit({
            productId: product.id, quantity: amount, reason, note: note || null,
          });
          await registerLog("CREATE", "Estoque",
            `Saída de ${num(amount, 3)} ${product.unit.toLowerCase()} de ${product.name} ` +
            `(${MOVEMENT_REASON_LABELS[reason]})`, product.id);
        });
        setSuccess(`Saída registrada: ${num(amount, 3)} ${product.unit.toLowerCase()} de ${product.name}.`);
      }

      // Limpa para o próximo lançamento: o normal é registrar outro item em
      // seguida, e o aviso de sucesso já diz o que foi gravado.
      setQuantity(""); setNote(""); setBatchCode(""); setExpiresAt("");
      setProductId(""); setSearch(""); setUnitCost(""); setSupplier("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const config = TITLES[mode];

  return (
    <div>
      <PageHeader title={config.title} subtitle={config.subtitle} />

      <div className="space-y-4">
        <Message error={error} success={success} />

        <Card className="space-y-3">
          <Field label="Produto" required>
            {product ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-leaf-500 bg-leaf-50 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">{product.name}</p>
                  <p className="text-xs text-ink-600">
                    {product.sku} · saldo {num(D(product.quantity), 3)} {product.unit.toLowerCase()}
                  </p>
                </div>
                <button type="button" className="shrink-0 text-sm font-semibold text-leaf-700"
                  onClick={() => { setProductId(""); setSearch(""); setUnitCost(""); }}>
                  Trocar
                </button>
              </div>
            ) : (
              <input className="input" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Digite o nome ou código" autoComplete="off" />
            )}
          </Field>

          {matches.length > 0 && (
            <div className="space-y-1.5">
              {matches.map((p: Product) => (
                <button key={p.id} type="button" onClick={() => setProductId(p.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-white px-3.5 py-3 text-left active:bg-ink-50">
                  <span className="min-w-0 truncate font-semibold text-ink-900">{p.name}</span>
                  <span className="shrink-0 text-xs text-ink-500">
                    {num(D(p.quantity), 1)} {p.unit.toLowerCase()}
                  </span>
                </button>
              ))}
            </div>
          )}

          {mode === "ajuste" && product && (
            <p className="rounded-xl bg-ink-50 px-3.5 py-3 text-sm text-ink-600">
              Saldo no sistema:{" "}
              <strong className="tabular-nums">
                {num(D(product.quantity), 3)} {product.unit.toLowerCase()}
              </strong>
            </p>
          )}

          <div className={mode === "entrada" ? "grid grid-cols-2 gap-3" : ""}>
            <Field label={mode === "ajuste" ? "Quantidade contada" : "Quantidade"} required>
              <input className="input" inputMode="decimal" value={quantity}
                onChange={(e) => setQuantity(e.target.value)} placeholder="0,000" />
            </Field>
            {mode === "entrada" && (
              <Field label="Custo unitário" hint="Recalcula o custo médio">
                <input className="input" inputMode="decimal" value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)} placeholder="0,00" />
              </Field>
            )}
          </div>

          {mode !== "ajuste" && (
            <Field label="Motivo">
              <select className="input" value={reason} onChange={(e) => setReason(e.target.value as MovementReason)}>
                {(mode === "entrada"
                  ? ["PURCHASE", "RETURN_IN", "OPENING"]
                  : ["LOSS", "ADJUSTMENT"]
                ).map((r) => <option key={r} value={r}>{MOVEMENT_REASON_LABELS[r]}</option>)}
              </select>
            </Field>
          )}

          {mode === "entrada" && product?.trackBatches && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Lote" hint="Gerado se vazio">
                  <input className="input" value={batchCode} onChange={(e) => setBatchCode(e.target.value)}
                    placeholder="LB-..." />
                </Field>
                <Field label="Validade">
                  <input type="date" className="input" value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)} />
                </Field>
              </div>
              <Field label="Fornecedor">
                <input className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Opcional" />
              </Field>
            </>
          )}

          <Field label={mode === "ajuste" ? "Motivo do ajuste" : "Observação"}>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={mode === "ajuste" ? "Ex.: contagem física de fim de mês" : "Opcional"} />
          </Field>
        </Card>

        <Busy busy={busy} onClick={() => void submit()}
          className={mode === "saida" ? "btn-danger w-full" : "btn-primary w-full"}>
          {config.button}
        </Busy>
      </div>
    </div>
  );
}
