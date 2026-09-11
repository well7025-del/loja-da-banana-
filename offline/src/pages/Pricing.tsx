import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, registerLog } from "@/data/db";
import { D, store } from "@/lib/money";
import { brl, num } from "@/lib/format";
import { computePrice, computeRecipeCost } from "@/logic/costing";
import { getSettings } from "@/logic/settings";
import { Busy, Card, Field, Message, PageHeader, SectionTitle, Spinner } from "@/components/ui";

export default function PricingPage() {
  const [params] = useSearchParams();
  const [productId, setProductId] = useState(params.get("produto") ?? "");
  const [cost, setCost] = useState("");
  const [tax, setTax] = useState("6");
  const [overhead, setOverhead] = useState("10");
  const [commission, setCommission] = useState("0");
  const [cardFee, setCardFee] = useState("3");
  const [margin, setMargin] = useState("30");
  const [currentPrice, setCurrentPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const [products, recipes, settings] = await Promise.all([
      db.products.toArray(), db.recipes.toArray(), getSettings(),
    ]);
    const byId = new Map(products.map((p) => [p.id, p]));
    const recipeCost = new Map<string, string>();
    for (const recipe of recipes) {
      if (recipe.deletedAt) continue;
      const product = byId.get(recipe.productId);
      if (!product) continue;
      recipeCost.set(recipe.productId, computeRecipeCost(recipe, product, byId).costPerUnit.toString());
    }
    return {
      products: products
        .filter((p) => !p.deletedAt && (p.kind === "FINISHED" || p.kind === "RESALE"))
        .sort((a, b) => a.name.localeCompare(b.name)),
      recipeCost, settings,
    };
  }, []);

  // Aplica os parâmetros salvos assim que carregam
  useEffect(() => {
    if (!data) return;
    setTax(data.settings.taxPct);
    setOverhead(data.settings.fixedOverheadPct);
    setCommission(data.settings.commissionPct);
    setCardFee(data.settings.cardFeePct);
    setMargin((current) => current === "30" ? data.settings.defaultTargetMarginPct : current);
  }, [data]);

  const product = data?.products.find((p) => p.id === productId);

  useEffect(() => {
    if (!product || !data) return;
    const base = data.recipeCost.get(product.id) ?? product.avgCost;
    setCost(D(base).greaterThan(0) ? D(base).toFixed(4) : "");
    setCurrentPrice(D(product.salePrice).greaterThan(0) ? D(product.salePrice).toFixed(2) : "");
    if (D(product.targetMargin).greaterThan(0)) setMargin(D(product.targetMargin).toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, data]);

  const result = useMemo(() => computePrice({
    unitCost: cost, taxPct: tax, fixedOverheadPct: overhead,
    commissionPct: commission, cardFeePct: cardFee, targetMarginPct: margin,
    currentPrice: currentPrice || undefined,
  }), [cost, tax, overhead, commission, cardFee, margin, currentPrice]);

  async function aplicarPreco() {
    if (!product) return;
    setBusy(true);
    try {
      await db.products.update(product.id, {
        salePrice: store(result.recommendedPrice),
        targetMargin: store(margin),
      });
      await registerLog("UPDATE", "Produto",
        `Aplicou preço de ${brl(result.recommendedPrice)} em ${product.name}`, product.id);
      setMessage(`Preço de ${brl(result.recommendedPrice)} aplicado em ${product.name}.`);
      setCurrentPrice(result.recommendedPrice.toFixed(2));
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Spinner />;

  return (
    <div>
      <PageHeader title="Formação de preço"
        subtitle="Custo, encargos e margem para chegar ao preço justo" />

      <div className="space-y-4">
        {message && <Message success={message} />}

        <Card className="space-y-3">
          <Field label="Produto">
            <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Cálculo livre</option>
              {data.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field
            label={`Custo unitário${product ? ` (por ${product.unit.toLowerCase()})` : ""}`}
            hint={product && data.recipeCost.has(product.id)
              ? "Vem da ficha técnica"
              : "Vem do custo médio das entradas"}
          >
            <input className="input !text-xl !font-bold" inputMode="decimal" value={cost}
              onChange={(e) => setCost(e.target.value)} placeholder="0,00" />
          </Field>
        </Card>

        <SectionTitle>Encargos sobre a venda</SectionTitle>
        <Card className="grid grid-cols-2 gap-3">
          <Field label="Impostos %">
            <input className="input" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
          </Field>
          <Field label="Despesas fixas %">
            <input className="input" inputMode="decimal" value={overhead}
              onChange={(e) => setOverhead(e.target.value)} />
          </Field>
          <Field label="Comissão %">
            <input className="input" inputMode="decimal" value={commission}
              onChange={(e) => setCommission(e.target.value)} />
          </Field>
          <Field label="Taxa de cartão %">
            <input className="input" inputMode="decimal" value={cardFee}
              onChange={(e) => setCardFee(e.target.value)} />
          </Field>
        </Card>

        <SectionTitle>Margem desejada</SectionTitle>
        <Card className="space-y-3">
          <Field label="Margem sobre o preço de venda %">
            <input className="input !text-xl !font-bold" inputMode="decimal" value={margin}
              onChange={(e) => setMargin(e.target.value)} />
          </Field>
          <input type="range" min={0} max={70} step={1} value={Math.min(70, D(margin).toNumber())}
            onChange={(e) => setMargin(e.target.value)} className="w-full accent-[var(--leaf)]"
            aria-label="Margem desejada" />
        </Card>

        <Card pad={false}>
          <div className="row"><span className="text-ink-500">Custo unitário</span>
            <span className="font-semibold tabular-nums">{brl(result.unitCost)}</span></div>
          <div className="row"><span className="text-ink-500">Encargos totais</span>
            <span className="font-semibold tabular-nums">{num(result.chargesPct, 2)}%</span></div>
          <div className="row"><span className="text-ink-500">Preço mínimo</span>
            <span className="font-semibold tabular-nums">{brl(result.minimumPrice)}</span></div>
          <div className="row bg-leaf-50">
            <span className="font-bold text-leaf-900">Preço recomendado</span>
            <span className="text-lg font-bold tabular-nums text-leaf-700">{brl(result.recommendedPrice)}</span></div>
          <div className="row"><span className="text-ink-500">Margem em R$</span>
            <span className="font-semibold tabular-nums">{brl(result.marginValue)}</span></div>
          <div className="row"><span className="text-ink-500">Fator de markup</span>
            <span className="font-semibold tabular-nums">
              {result.markupFactor.greaterThan(0) ? `${num(result.markupFactor, 2)}×` : "—"}
            </span></div>
        </Card>

        <SectionTitle>Comparar com o preço praticado</SectionTitle>
        <Card className="space-y-3">
          <Field label="Preço de venda atual">
            <input className="input" inputMode="decimal" value={currentPrice}
              onChange={(e) => setCurrentPrice(e.target.value)} placeholder="0,00" />
          </Field>
          {result.currentPrice && result.currentPrice.greaterThan(0) && (
            <div className={`rounded-xl px-3.5 py-3 text-sm ${
              result.belowMinimum ? "bg-red-50 text-red-700" : "bg-leaf-50 text-leaf-800"
            }`}>
              {result.belowMinimum ? (
                <p className="font-semibold">
                  ⚠️ Este preço está <strong>abaixo do mínimo</strong> de {brl(result.minimumPrice)}.
                  A venda não cobre custo e encargos.
                </p>
              ) : (
                <p className="font-semibold">
                  ✅ Margem real de {brl(result.currentMarginValue ?? 0)}{" "}
                  ({num(result.currentMarginPct ?? 0, 1)}%).
                </p>
              )}
            </div>
          )}
          {product && (
            <Busy busy={busy} onClick={() => void aplicarPreco()} className="btn-primary w-full">
              Aplicar {brl(result.recommendedPrice)} em {product.name}
            </Busy>
          )}
        </Card>
      </div>
    </div>
  );
}
