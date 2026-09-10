"use client";

import { useMemo, useState } from "react";
import { BarcodeScannerButton } from "./barcode-scanner";

export type PickableProduct = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  salePrice: number;
  wholesalePrice: number;
  avgCost: number;
  stock: number;
  barcode?: string | null;
};

export type Line = { productId: string; quantity: string; unitPrice: string; discountPct: string };

export type DiscountRule = {
  type: "QTY_DISCOUNT" | "ORDER_VALUE" | "CUSTOMER_TYPE";
  minQty: number;
  minValue: number;
  discountPct: number;
  channel: string | null;
  customerType: string | null;
  productId: string | null;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const parse = (v: string) => {
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Melhor desconto de linha conforme as regras cadastradas (prévia; o servidor recalcula). */
function lineDiscount(rules: DiscountRule[], productId: string, quantity: number, channel: string, customerType: string | null) {
  let best = 0;
  for (const rule of rules) {
    if (rule.channel && rule.channel !== channel) continue;
    if (rule.productId && rule.productId !== productId) continue;
    if (rule.customerType && rule.customerType !== customerType) continue;
    if (rule.type === "QTY_DISCOUNT" && quantity >= rule.minQty) best = Math.max(best, rule.discountPct);
    if (rule.type === "CUSTOMER_TYPE" && rule.customerType && rule.customerType === customerType) {
      best = Math.max(best, rule.discountPct);
    }
  }
  return best;
}

/**
 * Editor de itens usado em vendas, pedidos e compras.
 * Pensado para o celular: busca, um toque para adicionar, +/- para ajustar.
 */
export function ItemsEditor({
  products, mode = "sale", channel = "RETAIL", rules = [], customerType = null,
  showStock = true, initial = [],
}: {
  products: PickableProduct[];
  mode?: "sale" | "purchase";
  channel?: string;
  rules?: DiscountRule[];
  customerType?: string | null;
  showStock?: boolean;
  initial?: Line[];
}) {
  const [lines, setLines] = useState<Line[]>(initial);
  const [query, setQuery] = useState("");

  const priceOf = (p: PickableProduct) =>
    mode === "purchase"
      ? p.avgCost
      : channel === "WHOLESALE" && p.wholesalePrice > 0
        ? p.wholesalePrice
        : p.salePrice;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products
      .filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode ?? "").includes(q))
      .slice(0, 12);
  }, [query, products]);

  const add = (product: PickableProduct) => {
    setQuery("");
    setLines((current) => {
      const index = current.findIndex((l) => l.productId === product.id);
      if (index >= 0) {
        const next = [...current];
        next[index] = { ...next[index], quantity: String(parse(next[index].quantity) + 1) };
        return next;
      }
      return [...current, {
        productId: product.id,
        quantity: "1",
        unitPrice: priceOf(product).toFixed(2),
        discountPct: "",
      }];
    });
  };

  const patch = (index: number, patchValue: Partial<Line>) =>
    setLines((current) => current.map((l, i) => (i === index ? { ...l, ...patchValue } : l)));

  const remove = (index: number) => setLines((current) => current.filter((_, i) => i !== index));

  const step = (index: number, delta: number) => {
    const value = Math.max(0, Number((parse(lines[index].quantity) + delta).toFixed(3)));
    patch(index, { quantity: String(value) });
  };

  const computed = lines.map((line) => {
    const product = products.find((p) => p.id === line.productId)!;
    const quantity = parse(line.quantity);
    const unitPrice = parse(line.unitPrice);
    const gross = quantity * unitPrice;
    const auto = mode === "sale" ? lineDiscount(rules, line.productId, quantity, channel, customerType) : 0;
    const discountPct = line.discountPct === "" ? auto : parse(line.discountPct);
    const discount = (gross * discountPct) / 100;
    return { line, product, quantity, unitPrice, gross, discountPct, total: gross - discount, autoApplied: line.discountPct === "" && auto > 0 };
  });

  const subtotal = computed.reduce((a, c) => a + c.gross, 0);
  const discountTotal = computed.reduce((a, c) => a + (c.gross - c.total), 0);
  const total = subtotal - discountTotal;
  const costTotal = computed.reduce((a, c) => a + c.quantity * (c.product?.avgCost ?? 0), 0);

  return (
    <div className="space-y-3">
      {/* Busca e adição rápida */}
      <div>
        <label className="label" htmlFor="item-search">Adicionar produto</label>
        <div className="flex gap-2">
          <input
            id="item-search"
            type="search"
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome, código ou código de barras"
            autoComplete="off"
          />
          <BarcodeScannerButton
            label=""
            onDetect={(code) => {
              const found = products.find((p) => p.barcode === code || p.sku === code);
              if (found) add(found);
              else setQuery(code);
            }}
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {filtered.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => add(product)}
              className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-left transition active:scale-[.98] hover:border-leaf-500"
            >
              <span className="block truncate text-sm font-semibold text-ink-900">{product.name}</span>
              <span className="mt-0.5 block text-xs text-ink-500">
                {brl(priceOf(product))}/{product.unit.toLowerCase()}
                {showStock && ` · ${product.stock.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} em estoque`}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-2 rounded-xl bg-ink-50 px-3 py-3 text-sm text-ink-500">
              Nenhum produto encontrado para “{query}”.
            </p>
          )}
        </div>
      </div>

      {/* Linhas */}
      {computed.length > 0 && (
        <div className="card divide-y divide-[var(--border)]" >
          {computed.map((row, index) => (
            <div key={row.line.productId} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">{row.product?.name}</p>
                  <p className="text-xs text-ink-500">
                    {row.product?.sku}
                    {mode === "sale" && showStock && row.quantity > (row.product?.stock ?? 0) && (
                      <span className="ml-1 font-semibold text-red-600">· estoque insuficiente</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-red-600 hover:bg-red-50"
                  aria-label={`Remover ${row.product?.name}`}
                >
                  Remover
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <div className="flex items-center rounded-xl border border-[var(--border)]">
                  <button type="button" onClick={() => step(index, -1)} className="h-11 w-11 text-lg font-bold text-ink-600" aria-label="Diminuir">−</button>
                  <input
                    inputMode="decimal"
                    className="h-11 w-20 border-x border-[var(--border)] text-center text-base font-semibold tabular-nums outline-none"
                    value={row.line.quantity}
                    onChange={(e) => patch(index, { quantity: e.target.value })}
                    aria-label="Quantidade"
                  />
                  <button type="button" onClick={() => step(index, 1)} className="h-11 w-11 text-lg font-bold text-ink-600" aria-label="Aumentar">+</button>
                </div>
                <span className="text-sm text-ink-500">{row.product?.unit.toLowerCase()}</span>
                <div className="ml-auto text-right">
                  <p className="font-bold tabular-nums text-ink-900">{brl(row.total)}</p>
                  {row.discountPct > 0 && (
                    <p className="text-xs font-semibold text-leaf-700">
                      −{row.discountPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
                      {row.autoApplied ? " (automático)" : ""}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-ink-500">
                  {mode === "purchase" ? "Preço de compra" : "Preço unitário"}
                  <input
                    inputMode="decimal"
                    className="input mt-1 !min-h-[2.5rem] text-sm"
                    value={row.line.unitPrice}
                    onChange={(e) => patch(index, { unitPrice: e.target.value })}
                  />
                </label>
                {mode === "sale" && (
                  <label className="text-xs font-semibold text-ink-500">
                    Desconto %
                    <input
                      inputMode="decimal"
                      className="input mt-1 !min-h-[2.5rem] text-sm"
                      value={row.line.discountPct}
                      placeholder={row.autoApplied ? String(row.discountPct) : "0"}
                      onChange={(e) => patch(index, { discountPct: e.target.value })}
                    />
                  </label>
                )}
              </div>

              <input type="hidden" name={`items[${index}][productId]`} value={row.line.productId} />
              <input type="hidden" name={`items[${index}][quantity]`} value={row.line.quantity} />
              <input type="hidden" name={`items[${index}][unitPrice]`} value={row.line.unitPrice} />
              {mode === "sale" && (
                <input type="hidden" name={`items[${index}][discountPct]`} value={row.line.discountPct} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Totais */}
      {computed.length > 0 && (
        <div className="card card-pad space-y-1.5 bg-ink-50 text-sm">
          <div className="flex justify-between"><span className="text-ink-600">Subtotal</span><span className="font-semibold tabular-nums">{brl(subtotal)}</span></div>
          {discountTotal > 0 && (
            <div className="flex justify-between text-leaf-700">
              <span>Descontos</span><span className="font-semibold tabular-nums">−{brl(discountTotal)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-[var(--border)] pt-1.5 text-base">
            <span className="font-bold">Total</span>
            <span className="font-bold tabular-nums">{brl(total)}</span>
          </div>
          {mode === "sale" && costTotal > 0 && (
            <div className="flex justify-between text-xs text-ink-500">
              <span>Lucro bruto estimado</span>
              <span className="tabular-nums">{brl(total - costTotal)} ({total > 0 ? (((total - costTotal) / total) * 100).toFixed(1) : "0"}%)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
