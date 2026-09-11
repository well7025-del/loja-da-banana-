import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, newId, nowIso, registerLog } from "@/data/db";
import type { Product, Recipe, RecipeItem, Unit } from "@/data/types";
import { D, HUNDRED, ONE, ZERO, money, qty, store } from "@/lib/money";
import { brl } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/defaults";
import { Busy, Card, Field, Message, PageHeader, SectionTitle } from "@/components/ui";

type Line = { productId: string; quantity: string; unit: Unit; lossPct: string; isMain: boolean };

export default function RecipeEditPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [productId, setProductId] = useState(params.get("produto") ?? "");
  const [name, setName] = useState("");
  const [yieldQty, setYieldQty] = useState("");
  const [lossPct, setLossPct] = useState("0");
  const [labor, setLabor] = useState("0");
  const [energy, setEnergy] = useState("0");
  const [other, setOther] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [existing, setExisting] = useState<Recipe | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const products = useLiveQuery(async () => (await db.products.toArray()).filter((p) => !p.deletedAt), []);
  const byId = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);

  const finished = (products ?? []).filter((p) => p.kind === "FINISHED" || p.kind === "RESALE");
  const ingredientsPool = (products ?? []).filter(
    (p) => (p.kind === "RAW" || p.kind === "PACKAGING") && p.active,
  );

  useEffect(() => {
    if (!id) return;
    db.recipes.get(id).then((recipe) => {
      if (!recipe) { setError("Ficha técnica não encontrada."); return; }
      setExisting(recipe);
      setProductId(recipe.productId);
      setName(recipe.name);
      setYieldQty(D(recipe.yieldQty).toString());
      setLossPct(D(recipe.expectedLossPct).toString());
      setLabor(D(recipe.laborCost).toFixed(2));
      setEnergy(D(recipe.energyCost).toFixed(2));
      setOther(D(recipe.otherCost).toFixed(2));
      setNotes(recipe.notes ?? "");
      setLines(recipe.items.map((item) => ({
        productId: item.productId,
        quantity: D(item.quantity).toString(),
        unit: item.unit,
        lossPct: D(item.lossPct).toString(),
        isMain: item.isMain,
      })));
    });
  }, [id]);

  const available = useMemo(() => {
    const used = new Set(lines.map((l) => l.productId));
    const needle = search.trim().toLowerCase();
    return ingredientsPool
      .filter((p) => !used.has(p.id))
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle))
      .slice(0, needle ? 10 : 6);
  }, [ingredientsPool, lines, search]);

  const product = byId.get(productId);

  // Prévia do custo, recalculada a cada digitação
  const preview = useMemo(() => {
    const computed = lines.map((line) => {
      const ingredient = byId.get(line.productId);
      const net = D(line.quantity);
      const loss = D(line.lossPct);
      const factor = ONE.minus(loss.dividedBy(HUNDRED));
      const gross = factor.greaterThan(0) ? net.dividedBy(factor) : net;
      const total = money(gross.times(D(ingredient?.avgCost)));
      return { line, ingredient, gross, total };
    });
    const material = computed
      .filter((c) => c.ingredient?.kind !== "PACKAGING")
      .reduce((a, c) => a.plus(c.total), ZERO);
    const packaging = computed
      .filter((c) => c.ingredient?.kind === "PACKAGING")
      .reduce((a, c) => a.plus(c.total), ZERO);
    const overhead = D(labor).plus(D(energy)).plus(D(other));
    const total = money(material.plus(packaging).plus(overhead));
    const netYield = D(yieldQty).times(ONE.minus(D(lossPct).dividedBy(HUNDRED)));
    const unitCost = netYield.greaterThan(0) ? qty(total.dividedBy(netYield)) : ZERO;
    const mainQty = computed.find((c) => c.line.isMain)?.gross ?? ZERO;
    const expectedYield = mainQty.greaterThan(0)
      ? D(yieldQty).dividedBy(mainQty).times(HUNDRED)
      : ZERO;
    return { computed, material, packaging, overhead, total, unitCost, expectedYield };
  }, [lines, byId, labor, energy, other, yieldQty, lossPct]);

  function addIngredient(ingredient: Product) {
    setSearch("");
    setLines((current) => [...current, {
      productId: ingredient.id, quantity: "", unit: ingredient.unit, lossPct: "0",
      isMain: current.length === 0 && ingredient.kind === "RAW",
    }]);
  }

  const patch = (index: number, value: Partial<Line>) =>
    setLines((current) => current.map((l, i) => (i === index ? { ...l, ...value } : l)));

  async function save() {
    setError(null); setSuccess(null);
    if (!productId) { setError("Selecione o produto fabricado."); return; }
    const valid = lines.filter((l) => l.productId && D(l.quantity).greaterThan(0));
    if (!valid.length) { setError("Adicione ao menos um ingrediente com quantidade."); return; }
    if (D(yieldQty).lessThanOrEqualTo(0)) { setError("Informe o rendimento esperado."); return; }

    setBusy(true);
    try {
      const duplicate = await db.recipes
        .where("productId").equals(productId)
        .filter((r) => r.id !== id && !r.deletedAt).first();
      if (duplicate) {
        setError("Este produto já tem uma ficha técnica. Edite a existente.");
        setBusy(false);
        return;
      }

      const items: RecipeItem[] = valid.map((line) => ({
        productId: line.productId,
        quantity: store(line.quantity),
        unit: line.unit,
        lossPct: store(line.lossPct),
        isMain: line.isMain,
        note: null,
      }));

      const base = {
        productId, name: name.trim() || `${product?.name ?? "Produto"} — ficha técnica`,
        yieldQty: store(yieldQty), expectedLossPct: store(lossPct),
        laborCost: store(labor), energyCost: store(energy), otherCost: store(other),
        notes: notes.trim() || null, items, active: true, updatedAt: nowIso(),
      };

      if (existing) {
        await db.recipes.update(existing.id, base);
        await registerLog("UPDATE", "Ficha técnica", `Atualizou a ficha de ${product?.name}`, existing.id);
        setSuccess("Ficha técnica salva.");
      } else {
        const recipe: Recipe = { ...base, id: newId(), deletedAt: null, createdAt: nowIso() };
        await db.recipes.add(recipe);
        await registerLog("CREATE", "Ficha técnica", `Criou a ficha de ${product?.name}`, recipe.id);
        navigate(`/fichas-tecnicas/${recipe.id}`, { replace: true });
        setSuccess("Ficha técnica criada.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function excluir() {
    if (!existing) return;
    if (!window.confirm("Excluir esta ficha técnica?")) return;
    await db.recipes.update(existing.id, { deletedAt: nowIso(), active: false });
    navigate("/fichas-tecnicas");
  }

  return (
    <div>
      <PageHeader
        title={existing ? "Editar ficha técnica" : "Nova ficha técnica"}
        subtitle={product?.name}
      />

      <div className="space-y-4">
        <Message error={error} success={success} />

        <Card className="space-y-3">
          <Field label="Produto fabricado" required>
            <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Selecione</option>
              {finished.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Nome da ficha">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Banana Chips — receita padrão" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rendimento esperado" required
              hint={product ? `em ${UNIT_LABELS[product.unit] ?? product.unit}` : undefined}>
              <input className="input" inputMode="decimal" value={yieldQty}
                onChange={(e) => setYieldQty(e.target.value)} placeholder="30" />
            </Field>
            <Field label="Perda do processo %">
              <input className="input" inputMode="decimal" value={lossPct}
                onChange={(e) => setLossPct(e.target.value)} />
            </Field>
          </div>
        </Card>

        <SectionTitle>Ingredientes e embalagens</SectionTitle>
        <Card className="space-y-3">
          <Field label="Adicionar item">
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar matéria-prima ou embalagem" autoComplete="off" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            {available.map((ingredient) => (
              <button key={ingredient.id} type="button" onClick={() => addIngredient(ingredient)}
                className="rounded-xl border border-[var(--border)] px-3 py-2.5 text-left text-sm font-semibold text-ink-800 hover:border-leaf-500 active:scale-[.98]">
                <span className="block truncate">{ingredient.name}</span>
                <span className="text-xs font-normal text-ink-500">
                  {brl(ingredient.avgCost)}/{ingredient.unit.toLowerCase()}
                </span>
              </button>
            ))}
          </div>
        </Card>

        {preview.computed.length > 0 && (
          <Card pad={false} className="divide-y divide-[var(--border)]">
            {preview.computed.map((row, index) => (
              <div key={row.line.productId} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">{row.ingredient?.name}</p>
                    <p className="text-xs text-ink-500">
                      {brl(row.ingredient?.avgCost ?? 0)}/{row.ingredient?.unit.toLowerCase()} ·
                      {" "}custo {brl(row.total)}
                    </p>
                  </div>
                  <button type="button" className="shrink-0 text-sm font-semibold text-red-600"
                    onClick={() => setLines((c) => c.filter((_, i) => i !== index))}>
                    Remover
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <label className="text-xs font-semibold text-ink-500">
                    Quantidade
                    <input className="input mt-1 !min-h-[2.5rem] text-sm" inputMode="decimal"
                      aria-label="Quantidade do ingrediente"
                      value={row.line.quantity} onChange={(e) => patch(index, { quantity: e.target.value })} />
                  </label>
                  <label className="text-xs font-semibold text-ink-500">
                    Unidade
                    <select className="input mt-1 !min-h-[2.5rem] text-sm" value={row.line.unit}
                      onChange={(e) => patch(index, { unit: e.target.value as Unit })}>
                      {Object.entries(UNIT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-ink-500">
                    Perda %
                    <input className="input mt-1 !min-h-[2.5rem] text-sm" inputMode="decimal"
                      value={row.line.lossPct} onChange={(e) => patch(index, { lossPct: e.target.value })} />
                  </label>
                </div>
                {row.ingredient?.kind === "RAW" && (
                  <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-ink-600">
                    <input type="radio" name="principal" className="h-4 w-4" checked={row.line.isMain}
                      onChange={() => setLines((c) => c.map((l, i) => ({ ...l, isMain: i === index })))} />
                    Ingrediente principal (base do cálculo de rendimento)
                  </label>
                )}
              </div>
            ))}
          </Card>
        )}

        <SectionTitle>Outros custos</SectionTitle>
        <Card className="grid grid-cols-3 gap-3">
          <Field label="Mão de obra">
            <input className="input" inputMode="decimal" value={labor} onChange={(e) => setLabor(e.target.value)} />
          </Field>
          <Field label="Energia">
            <input className="input" inputMode="decimal" value={energy} onChange={(e) => setEnergy(e.target.value)} />
          </Field>
          <Field label="Outros">
            <input className="input" inputMode="decimal" value={other} onChange={(e) => setOther(e.target.value)} />
          </Field>
        </Card>

        <Card className="space-y-1.5 bg-ink-50 text-sm">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Prévia do custo</p>
          <div className="flex justify-between"><span className="text-ink-600">Matéria-prima</span>
            <span className="font-semibold tabular-nums">{brl(preview.material)}</span></div>
          <div className="flex justify-between"><span className="text-ink-600">Embalagem</span>
            <span className="font-semibold tabular-nums">{brl(preview.packaging)}</span></div>
          <div className="flex justify-between"><span className="text-ink-600">Mão de obra, energia e outros</span>
            <span className="font-semibold tabular-nums">{brl(preview.overhead)}</span></div>
          <div className="flex justify-between border-t border-[var(--border)] pt-1.5">
            <span className="font-bold">Custo total da receita</span>
            <span className="font-bold tabular-nums">{brl(preview.total)}</span></div>
          <div className="flex justify-between text-leaf-700">
            <span className="font-bold">Custo por {product ? UNIT_LABELS[product.unit] : "unidade"}</span>
            <span className="font-bold tabular-nums">{brl(preview.unitCost)}</span></div>
          {preview.expectedYield.greaterThan(0) && (
            <p className="text-xs text-ink-500">
              Rendimento previsto: {preview.expectedYield.toFixed(1)}% sobre o ingrediente principal
            </p>
          )}
        </Card>

        <Card>
          <Field label="Observações do processo">
            <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Temperatura, tempo de fritura, corte..." />
          </Field>
        </Card>

        <Busy busy={busy} onClick={() => void save()}>
          {existing ? "Salvar ficha técnica" : "Criar ficha técnica"}
        </Busy>

        {existing && (
          <button type="button" onClick={() => void excluir()} className="btn-ghost w-full !text-red-600">
            Excluir ficha técnica
          </button>
        )}
      </div>
    </div>
  );
}
