import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import type { Product } from "@/data/types";
import { D } from "@/lib/money";
import { brl, num } from "@/lib/format";
import { STOCK_ADJUSTMENT_KINDS, UNIT_LABELS, type StockAdjustmentKind } from "@/lib/defaults";
import { registerStockAdjustment } from "@/logic/stock";
import {
  Busy, Card, DocumentPicker, Field, Message, PageHeader, Tabs,
} from "@/components/ui";

export default function StockAdjustPage() {
  const [kind, setKind] = useState<StockAdjustmentKind>("LOSS");
  const [productId, setProductId] = useState("");
  const [search, setSearch] = useState("");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [document, setDocument] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const products = useLiveQuery(
    async () => (await db.products.toArray())
      .filter((p) => !p.deletedAt && p.active)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const selected = useMemo(
    () => (products ?? []).find((p) => p.id === productId),
    [products, productId],
  );

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const pool = products ?? [];
    if (!needle) return pool.slice(0, 6);
    return pool
      .filter((p) => p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle))
      .slice(0, 10);
  }, [products, search]);

  const current = selected ? D(selected.quantity) : null;
  const meta = STOCK_ADJUSTMENT_KINDS.find((k) => k.id === kind)!;
  const isCount = meta.direction === "SET";

  async function salvar() {
    setError(null); setSuccess(null);
    if (!productId) { setError("Escolha o produto."); return; }
    if (!value.trim()) { setError(isCount ? "Informe o saldo contado." : "Informe a quantidade."); return; }
    if (!reason.trim()) { setError("Ajustes extraordinários exigem uma justificativa."); return; }

    setBusy(true);
    try {
      await registerStockAdjustment({ kind, productId, value, reason, document });
      setSuccess(
        `${meta.label} registrada em ${selected?.name}.` +
        (document ? " Documento anexado." : ""),
      );
      setValue(""); setReason(""); setDocument(null); setProductId(""); setSearch("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Ajuste extraordinário"
        subtitle="Perda, devolução, inventário ou balanço — com justificativa" />

      <div className="space-y-4">
        <Message error={error} success={success} />

        <Card className="space-y-3">
          <span className="label">O que aconteceu</span>
          <Tabs
            value={kind}
            onChange={(next) => { setKind(next); setValue(""); }}
            options={STOCK_ADJUSTMENT_KINDS.map((k) => ({ id: k.id, label: k.label, icon: k.icon }))}
          />
          <p className="text-sm text-ink-600">{meta.help}</p>
          {kind === "INVENTORY" && (
            <p className="rounded-xl bg-sky-50 px-3.5 py-3 text-sm text-sky-900 ring-1 ring-sky-200">
              Para contar o estoque inteiro de uma vez, com relatório de divergências,
              use o{" "}
              <Link to="/inventario" className="font-bold underline">inventário completo</Link>.
              Aqui é só o acerto de um item.
            </p>
          )}
        </Card>

        <Card className="space-y-3">
          <Field label="Produto" required>
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou código" autoComplete="off" />
          </Field>
          <div className="grid gap-2">
            {matches.map((product) => (
              <ProductOption key={product.id} product={product}
                selected={product.id === productId}
                onPick={() => { setProductId(product.id); setSearch(product.name); }} />
            ))}
          </div>
        </Card>

        {selected && (
          <Card className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink-600">Saldo atual</span>
              <span className="text-lg font-bold tabular-nums text-ink-900">
                {num(current ?? 0, 3)} {UNIT_LABELS[selected.unit] ?? ""}
              </span>
            </div>

            <Field
              label={isCount ? "Saldo contado" : `Quantidade de ${meta.label.toLowerCase()}`}
              required
              hint={isCount
                ? "O sistema calcula a diferença e registra o ajuste."
                : `Em ${UNIT_LABELS[selected.unit] ?? "unidades"}.`}
            >
              <input className="input" inputMode="decimal" value={value}
                onChange={(e) => setValue(e.target.value)} placeholder="0,000" />
            </Field>

            {isCount && value && current && (
              <p className="rounded-xl bg-ink-50 px-3.5 py-3 text-sm font-medium text-ink-700">
                Diferença: {num(D(value).minus(current), 3)} {UNIT_LABELS[selected.unit] ?? ""} ·{" "}
                {brl(D(value).minus(current).times(D(selected.avgCost)))}
              </p>
            )}

            <Field label="Justificativa" required
              hint="Fica no relatório de ajustes extraordinários.">
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder={kind === "LOSS" ? "Ex.: lote vencido descartado" : "Ex.: recontagem do dia"} />
            </Field>

            <DocumentPicker file={document} onPick={setDocument}
              hint="Foto do laudo, autorização assinada ou nota de devolução." />

            <Busy busy={busy} onClick={() => void salvar()}>
              Registrar {meta.label.toLowerCase()}
            </Busy>
          </Card>
        )}
      </div>
    </div>
  );
}

function ProductOption({ product, selected, onPick }: {
  product: Product; selected: boolean; onPick: () => void;
}) {
  return (
    <button type="button" onClick={onPick}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
        selected ? "border-leaf-500 bg-leaf-50" : "border-[var(--border)] bg-white"
      }`}>
      {product.imageUrl && (
        <img src={product.imageUrl} alt="" aria-hidden className="h-9 w-9 rounded-lg object-cover" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink-900">{product.name}</span>
        <span className="block text-xs text-ink-500">
          {product.sku} · {num(D(product.quantity), 3)} {UNIT_LABELS[product.unit] ?? ""}
        </span>
      </span>
    </button>
  );
}
