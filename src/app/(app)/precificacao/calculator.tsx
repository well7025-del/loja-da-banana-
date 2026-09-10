"use client";

import { useEffect, useState } from "react";
import { Card, Field, SectionTitle } from "@/components/ui";

type Product = {
  id: string; name: string; unit: string;
  avgCost: number; recipeCost: number | null; salePrice: number; targetMargin: number;
};

type Defaults = {
  taxPct: number; fixedOverheadPct: number; commissionPct: number;
  cardFeePct: number; targetMarginPct: number;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const parse = (v: string) => {
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Método do divisor: PV = custo / (1 − encargos% − margem%).
 * Mesma fórmula usada no servidor, para o resultado bater exatamente.
 */
export function PricingCalculator({
  products, defaults, initialProductId,
}: { products: Product[]; defaults: Defaults; initialProductId: string }) {
  const [productId, setProductId] = useState(initialProductId || products[0]?.id || "");
  const [cost, setCost] = useState("");
  const [tax, setTax] = useState(String(defaults.taxPct));
  const [overhead, setOverhead] = useState(String(defaults.fixedOverheadPct));
  const [commission, setCommission] = useState(String(defaults.commissionPct));
  const [cardFee, setCardFee] = useState(String(defaults.cardFeePct));
  const [margin, setMargin] = useState(String(defaults.targetMarginPct));
  const [currentPrice, setCurrentPrice] = useState("");

  const product = products.find((p) => p.id === productId);

  useEffect(() => {
    if (!product) return;
    const base = product.recipeCost ?? product.avgCost;
    setCost(base ? base.toFixed(4) : "");
    setCurrentPrice(product.salePrice ? product.salePrice.toFixed(2) : "");
    if (product.targetMargin > 0) setMargin(String(product.targetMargin));
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  const unitCost = parse(cost);
  const charges = parse(tax) + parse(overhead) + parse(commission) + parse(cardFee);
  const marginPct = parse(margin);

  const divisorMin = 1 - charges / 100;
  const minimumPrice = divisorMin > 0 ? unitCost / divisorMin : unitCost * 10;
  const divisor = 1 - (charges + marginPct) / 100;
  const recommended = divisor > 0 ? unitCost / divisor : unitCost * 10;
  const chargesValue = (recommended * charges) / 100;
  const marginValue = recommended - unitCost - chargesValue;

  const price = parse(currentPrice);
  const currentCharges = (price * charges) / 100;
  const currentMarginValue = price - unitCost - currentCharges;
  const currentMarginPct = price > 0 ? (currentMarginValue / price) * 100 : 0;
  const below = price > 0 && price < minimumPrice;

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <Field label="Produto">
          <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Cálculo livre</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field
          label={`Custo unitário${product ? ` (por ${product.unit.toLowerCase()})` : ""}`}
          hint={product?.recipeCost != null ? "Vem da ficha técnica" : "Vem do custo médio de compra"}
        >
          <input className="input !text-xl !font-bold" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" />
        </Field>
      </Card>

      <SectionTitle>Encargos sobre a venda</SectionTitle>
      <Card className="grid grid-cols-2 gap-3">
        <Field label="Impostos %"><input className="input" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} /></Field>
        <Field label="Despesas fixas %"><input className="input" inputMode="decimal" value={overhead} onChange={(e) => setOverhead(e.target.value)} /></Field>
        <Field label="Comissão %"><input className="input" inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} /></Field>
        <Field label="Taxa de cartão %"><input className="input" inputMode="decimal" value={cardFee} onChange={(e) => setCardFee(e.target.value)} /></Field>
      </Card>

      <SectionTitle>Margem desejada</SectionTitle>
      <Card className="space-y-3">
        <Field label="Margem sobre o preço de venda %">
          <input className="input !text-xl !font-bold" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} />
        </Field>
        <input
          type="range" min={0} max={70} step={1} value={Math.min(70, marginPct)}
          onChange={(e) => setMargin(e.target.value)}
          className="w-full accent-[var(--leaf)]"
          aria-label="Margem desejada"
        />
      </Card>

      <Card pad={false}>
        <div className="row"><span className="text-ink-500">Custo unitário</span><span className="font-semibold tabular-nums">{brl(unitCost)}</span></div>
        <div className="row"><span className="text-ink-500">Encargos totais</span><span className="font-semibold tabular-nums">{charges.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</span></div>
        <div className="row">
          <span className="text-ink-500">Preço mínimo</span>
          <span className="font-semibold tabular-nums">{brl(minimumPrice)}</span>
        </div>
        <div className="row bg-leaf-50">
          <span className="font-bold text-leaf-900">Preço recomendado</span>
          <span className="text-lg font-bold tabular-nums text-leaf-700">{brl(recommended)}</span>
        </div>
        <div className="row"><span className="text-ink-500">Margem em R$</span><span className="font-semibold tabular-nums">{brl(marginValue)}</span></div>
        <div className="row"><span className="text-ink-500">Margem em %</span>
          <span className="font-semibold tabular-nums">
            {recommended > 0 ? ((marginValue / recommended) * 100).toFixed(1) : "0"}%
          </span>
        </div>
        <div className="row"><span className="text-ink-500">Fator de markup</span>
          <span className="font-semibold tabular-nums">{unitCost > 0 ? (recommended / unitCost).toFixed(2) : "—"}×</span>
        </div>
      </Card>

      <SectionTitle>Comparar com o preço praticado</SectionTitle>
      <Card className="space-y-3">
        <Field label="Preço de venda atual">
          <input className="input" inputMode="decimal" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} placeholder="0,00" />
        </Field>
        {price > 0 && (
          <div className={`rounded-xl px-3.5 py-3 text-sm ${below ? "bg-red-50 text-red-700" : "bg-leaf-50 text-leaf-800"}`}>
            {below ? (
              <p className="font-semibold">
                ⚠️ Este preço está <strong>abaixo do mínimo</strong> de {brl(minimumPrice)}. A venda não cobre custo e encargos.
              </p>
            ) : (
              <p className="font-semibold">
                ✅ Margem real de {brl(currentMarginValue)} ({currentMarginPct.toFixed(1)}%) por {product?.unit.toLowerCase() ?? "unidade"}.
              </p>
            )}
            <p className="mt-1 text-xs">
              Diferença para o preço recomendado: {brl(price - recommended)}
            </p>
          </div>
        )}
        {product && (
          <p className="hint">
            Para gravar o novo preço, edite o produto em Produtos → {product.name}.
          </p>
        )}
      </Card>
    </div>
  );
}
