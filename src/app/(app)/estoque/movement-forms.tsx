"use client";

import { useState } from "react";
import { ActionForm } from "@/components/forms";
import { Card, Field } from "@/components/ui";
import { stockAdjustAction, stockEntryAction, stockExitAction } from "@/app/actions/stock";
import { MOVEMENT_REASON_LABELS } from "@/lib/defaults";

export type StockProduct = {
  id: string; sku: string; name: string; unit: string; stock: number;
  trackBatches: boolean; avgCost: number;
};

function ProductPicker({
  products, value, onChange,
}: { products: StockProduct[]; value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const selected = products.find((p) => p.id === value);
  const filtered = query.trim()
    ? products.filter((p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) || p.sku.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 8)
    : [];

  return (
    <div>
      <Field label="Produto" required>
        {selected ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-leaf-500 bg-leaf-50 px-3.5 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink-900">{selected.name}</p>
              <p className="text-xs text-ink-600">
                {selected.sku} · saldo {selected.stock.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {selected.unit.toLowerCase()}
              </p>
            </div>
            <button type="button" onClick={() => { onChange(""); setQuery(""); }} className="shrink-0 text-sm font-semibold text-leaf-700">
              Trocar
            </button>
          </div>
        ) : (
          <input
            className="input" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite o nome ou código" autoComplete="off"
          />
        )}
      </Field>
      {!selected && filtered.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {filtered.map((p) => (
            <button
              key={p.id} type="button" onClick={() => onChange(p.id)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-white px-3.5 py-3 text-left active:bg-ink-50"
            >
              <span className="min-w-0 truncate font-semibold text-ink-900">{p.name}</span>
              <span className="shrink-0 text-xs text-ink-500">
                {p.stock.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} {p.unit.toLowerCase()}
              </span>
            </button>
          ))}
        </div>
      )}
      <input type="hidden" name="productId" value={value} />
    </div>
  );
}

export function StockEntryForm({ products, suppliers }: { products: StockProduct[]; suppliers: { id: string; name: string }[] }) {
  const [productId, setProductId] = useState("");
  const product = products.find((p) => p.id === productId);

  return (
    <ActionForm action={stockEntryAction} submitLabel="Registrar entrada" pendingLabel="Registrando...">
      <Card className="space-y-3">
        <ProductPicker products={products} value={productId} onChange={setProductId} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade" required>
            <input name="quantity" className="input" inputMode="decimal" placeholder="0,000" required />
          </Field>
          <Field label="Custo unitário" hint="Recalcula o custo médio">
            <input name="unitCost" className="input" inputMode="decimal" placeholder={product ? product.avgCost.toFixed(2) : "0,00"} />
          </Field>
        </div>
        <Field label="Motivo">
          <select name="reason" className="input" defaultValue="PURCHASE">
            {["PURCHASE", "RETURN_IN", "TRANSFER_IN", "OPENING"].map((r) => (
              <option key={r} value={r}>{MOVEMENT_REASON_LABELS[r]}</option>
            ))}
          </select>
        </Field>
        {product?.trackBatches && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lote" hint="Gerado se vazio">
              <input name="batchCode" className="input" placeholder="LB-..." />
            </Field>
            <Field label="Validade">
              <input name="expiresAt" type="date" className="input" />
            </Field>
          </div>
        )}
        <Field label="Fornecedor">
          <select name="supplierId" className="input" defaultValue="">
            <option value="">Não informar</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Observação">
          <input name="note" className="input" placeholder="Opcional" />
        </Field>
      </Card>
    </ActionForm>
  );
}

export function StockExitForm({ products }: { products: StockProduct[] }) {
  const [productId, setProductId] = useState("");
  return (
    <ActionForm action={stockExitAction} submitLabel="Registrar saída" pendingLabel="Registrando..." buttonClass="btn-danger w-full">
      <Card className="space-y-3">
        <ProductPicker products={products} value={productId} onChange={setProductId} />
        <Field label="Quantidade" required>
          <input name="quantity" className="input" inputMode="decimal" placeholder="0,000" required />
        </Field>
        <Field label="Motivo" hint="A baixa segue o lote mais próximo do vencimento">
          <select name="reason" className="input" defaultValue="LOSS">
            {["LOSS", "TRANSFER_OUT", "RETURN_OUT", "ADJUSTMENT"].map((r) => (
              <option key={r} value={r}>{MOVEMENT_REASON_LABELS[r]}</option>
            ))}
          </select>
        </Field>
        <Field label="Observação">
          <input name="note" className="input" placeholder="Ex.: quebra na embalagem" />
        </Field>
      </Card>
    </ActionForm>
  );
}

export function StockAdjustForm({ products }: { products: StockProduct[] }) {
  const [productId, setProductId] = useState("");
  const product = products.find((p) => p.id === productId);
  return (
    <ActionForm action={stockAdjustAction} submitLabel="Ajustar saldo" pendingLabel="Ajustando...">
      <Card className="space-y-3">
        <ProductPicker products={products} value={productId} onChange={setProductId} />
        {product && (
          <p className="rounded-xl bg-ink-50 px-3.5 py-3 text-sm text-ink-600">
            Saldo no sistema: <strong className="tabular-nums">
              {product.stock.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {product.unit.toLowerCase()}
            </strong>
          </p>
        )}
        <Field label="Quantidade contada" required hint="O sistema registra a diferença como ajuste">
          <input name="countedQty" className="input" inputMode="decimal" placeholder="0,000" required />
        </Field>
        <Field label="Motivo do ajuste">
          <input name="note" className="input" placeholder="Ex.: contagem física de fim de mês" />
        </Field>
      </Card>
    </ActionForm>
  );
}
