"use client";

import { useMemo, useState } from "react";
import { ActionForm } from "@/components/forms";
import { Card, Field, SectionTitle } from "@/components/ui";
import { saveRecipeAction } from "@/app/actions/recipes";
import { UNIT_LABELS } from "@/lib/defaults";

export type Ingredient = { id: string; sku: string; name: string; unit: string; kind: string; avgCost: number };
export type RecipeLine = { productId: string; quantity: string; unit: string; lossPct: string; isMain: boolean; note: string };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const parse = (v: string) => {
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function RecipeForm({
  recipe, products, ingredients,
}: {
  recipe?: {
    id: string; productId: string; name: string; yieldQty: string; expectedLossPct: string;
    laborCost: string; energyCost: string; otherCost: string; notes: string | null; items: RecipeLine[];
  };
  products: { id: string; name: string; unit: string }[];
  ingredients: Ingredient[];
}) {
  const [productId, setProductId] = useState(recipe?.productId ?? products[0]?.id ?? "");
  const [lines, setLines] = useState<RecipeLine[]>(recipe?.items ?? []);
  const [yieldQty, setYieldQty] = useState(recipe?.yieldQty ?? "");
  const [lossPct, setLossPct] = useState(recipe?.expectedLossPct ?? "0");
  const [labor, setLabor] = useState(recipe?.laborCost ?? "0");
  const [energy, setEnergy] = useState(recipe?.energyCost ?? "0");
  const [other, setOther] = useState(recipe?.otherCost ?? "0");
  const [query, setQuery] = useState("");

  const product = products.find((p) => p.id === productId);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    const used = new Set(lines.map((l) => l.productId));
    return ingredients
      .filter((i) => !used.has(i.id) && (!q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)))
      .slice(0, q ? 10 : 6);
  }, [query, lines, ingredients]);

  const add = (ingredient: Ingredient) => {
    setQuery("");
    setLines((current) => [...current, {
      productId: ingredient.id, quantity: "", unit: ingredient.unit,
      lossPct: "0", isMain: current.length === 0 && ingredient.kind === "RAW", note: "",
    }]);
  };

  const patch = (index: number, value: Partial<RecipeLine>) =>
    setLines((current) => current.map((l, i) => (i === index ? { ...l, ...value } : l)));

  const setMain = (index: number) =>
    setLines((current) => current.map((l, i) => ({ ...l, isMain: i === index })));

  // Prévia do custo (o servidor recalcula na gravação)
  const computed = lines.map((line) => {
    const ingredient = ingredients.find((i) => i.id === line.productId)!;
    const net = parse(line.quantity);
    const loss = parse(line.lossPct);
    const gross = loss < 100 ? net / (1 - loss / 100) : net;
    const total = gross * (ingredient?.avgCost ?? 0);
    return { line, ingredient, gross, total };
  });

  const materialCost = computed.filter((c) => c.ingredient?.kind !== "PACKAGING").reduce((a, c) => a + c.total, 0);
  const packagingCost = computed.filter((c) => c.ingredient?.kind === "PACKAGING").reduce((a, c) => a + c.total, 0);
  const overhead = parse(labor) + parse(energy) + parse(other);
  const totalCost = materialCost + packagingCost + overhead;
  const netYield = parse(yieldQty) * (1 - parse(lossPct) / 100);
  const unitCost = netYield > 0 ? totalCost / netYield : 0;
  const mainQty = computed.find((c) => c.line.isMain)?.gross ?? 0;
  const expectedYield = mainQty > 0 ? (parse(yieldQty) / mainQty) * 100 : 0;

  return (
    <ActionForm action={saveRecipeAction} submitLabel={recipe ? "Salvar ficha técnica" : "Criar ficha técnica"}>
      {recipe && <input type="hidden" name="id" value={recipe.id} />}

      <Card className="space-y-3">
        <Field label="Produto fabricado" required>
          <select name="productId" className="input" value={productId} onChange={(e) => setProductId(e.target.value)} required>
            <option value="">Selecione</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Nome da ficha">
          <input name="name" className="input" defaultValue={recipe?.name ?? ""} placeholder="Ex.: Banana Chips — receita padrão" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rendimento esperado" required hint={product ? `em ${UNIT_LABELS[product.unit] ?? product.unit}` : undefined}>
            <input name="yieldQty" className="input" inputMode="decimal" value={yieldQty}
              onChange={(e) => setYieldQty(e.target.value)} placeholder="30" required />
          </Field>
          <Field label="Perda do processo %" hint="Quebra, sobra de fritura">
            <input name="expectedLossPct" className="input" inputMode="decimal" value={lossPct} onChange={(e) => setLossPct(e.target.value)} />
          </Field>
        </div>
      </Card>

      <SectionTitle>Ingredientes e embalagens</SectionTitle>
      <Card className="space-y-3">
        <Field label="Adicionar item">
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar matéria-prima ou embalagem" autoComplete="off" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          {available.map((ingredient) => (
            <button
              key={ingredient.id} type="button" onClick={() => add(ingredient)}
              className="rounded-xl border border-[var(--border)] px-3 py-2.5 text-left text-sm font-semibold text-ink-800 active:scale-[.98] hover:border-leaf-500"
            >
              <span className="block truncate">{ingredient.name}</span>
              <span className="text-xs font-normal text-ink-500">{brl(ingredient.avgCost)}/{ingredient.unit.toLowerCase()}</span>
            </button>
          ))}
        </div>
      </Card>

      {computed.length > 0 && (
        <Card pad={false} className="divide-y divide-[var(--border)]">
          {computed.map((row, index) => (
            <div key={row.line.productId} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">{row.ingredient?.name}</p>
                  <p className="text-xs text-ink-500">
                    {brl(row.ingredient?.avgCost ?? 0)}/{row.ingredient?.unit.toLowerCase()} · custo {brl(row.total)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLines((c) => c.filter((_, i) => i !== index))}
                  className="shrink-0 text-sm font-semibold text-red-600"
                >
                  Remover
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="text-xs font-semibold text-ink-500">
                  Quantidade
                  <input
                    inputMode="decimal" className="input mt-1 !min-h-[2.5rem] text-sm"
                    aria-label="Quantidade do ingrediente"
                    value={row.line.quantity} onChange={(e) => patch(index, { quantity: e.target.value })}
                  />
                </label>
                <label className="text-xs font-semibold text-ink-500">
                  Unidade
                  <select className="input mt-1 !min-h-[2.5rem] text-sm" value={row.line.unit} onChange={(e) => patch(index, { unit: e.target.value })}>
                    {Object.entries(UNIT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-ink-500">
                  Perda %
                  <input
                    inputMode="decimal" className="input mt-1 !min-h-[2.5rem] text-sm"
                    value={row.line.lossPct} onChange={(e) => patch(index, { lossPct: e.target.value })}
                  />
                </label>
              </div>
              {row.ingredient?.kind === "RAW" && (
                <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-ink-600">
                  <input type="radio" name="mainIngredient" checked={row.line.isMain} onChange={() => setMain(index)} className="h-4 w-4" />
                  Ingrediente principal (base do cálculo de rendimento)
                </label>
              )}
              {parse(row.line.lossPct) > 0 && (
                <p className="mt-1 text-xs text-ink-500">
                  Compra necessária com perda: <strong>{row.gross.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</strong>
                </p>
              )}
              <input type="hidden" name={`items[${index}][productId]`} value={row.line.productId} />
              <input type="hidden" name={`items[${index}][quantity]`} value={row.line.quantity} />
              <input type="hidden" name={`items[${index}][unit]`} value={row.line.unit} />
              <input type="hidden" name={`items[${index}][lossPct]`} value={row.line.lossPct} />
              <input type="hidden" name={`items[${index}][isMain]`} value={String(row.line.isMain)} />
              <input type="hidden" name={`items[${index}][note]`} value={row.line.note} />
            </div>
          ))}
        </Card>
      )}

      <SectionTitle>Outros custos da receita</SectionTitle>
      <Card className="grid grid-cols-3 gap-3">
        <Field label="Mão de obra">
          <input name="laborCost" className="input" inputMode="decimal" value={labor} onChange={(e) => setLabor(e.target.value)} />
        </Field>
        <Field label="Energia">
          <input name="energyCost" className="input" inputMode="decimal" value={energy} onChange={(e) => setEnergy(e.target.value)} />
        </Field>
        <Field label="Outros">
          <input name="otherCost" className="input" inputMode="decimal" value={other} onChange={(e) => setOther(e.target.value)} />
        </Field>
      </Card>

      <Card className="space-y-1.5 bg-ink-50 text-sm">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Prévia do custo</p>
        <div className="flex justify-between"><span className="text-ink-600">Matéria-prima</span><span className="font-semibold tabular-nums">{brl(materialCost)}</span></div>
        <div className="flex justify-between"><span className="text-ink-600">Embalagem</span><span className="font-semibold tabular-nums">{brl(packagingCost)}</span></div>
        <div className="flex justify-between"><span className="text-ink-600">Mão de obra, energia e outros</span><span className="font-semibold tabular-nums">{brl(overhead)}</span></div>
        <div className="flex justify-between border-t border-[var(--border)] pt-1.5">
          <span className="font-bold">Custo total da receita</span><span className="font-bold tabular-nums">{brl(totalCost)}</span>
        </div>
        <div className="flex justify-between text-leaf-700">
          <span className="font-bold">Custo por {product ? UNIT_LABELS[product.unit] ?? product.unit : "unidade"}</span>
          <span className="font-bold tabular-nums">{brl(unitCost)}</span>
        </div>
        {expectedYield > 0 && (
          <p className="text-xs text-ink-500">Rendimento previsto: {expectedYield.toFixed(1)}% sobre o ingrediente principal</p>
        )}
      </Card>

      <Card>
        <Field label="Observações do processo">
          <textarea name="notes" className="input" rows={3} defaultValue={recipe?.notes ?? ""} placeholder="Temperatura, tempo de fritura, corte..." />
        </Field>
      </Card>
    </ActionForm>
  );
}
