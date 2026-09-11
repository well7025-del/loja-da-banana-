import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { D } from "@/lib/money";
import { brl, num } from "@/lib/format";
import { explodeRecipe, type Explosion } from "@/logic/production";
import { createProduction } from "@/logic/production";
import { Busy, Card, Field, Message, PageHeader } from "@/components/ui";

export default function ProductionNewPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [productId, setProductId] = useState(params.get("produto") ?? "");
  const [plannedQty, setPlannedQty] = useState(params.get("qtd") ?? "");
  const [startNow, setStartNow] = useState(true);
  const [notes, setNotes] = useState("");
  const [explosion, setExplosion] = useState<Explosion | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const [products, recipes] = await Promise.all([db.products.toArray(), db.recipes.toArray()]);
    const withRecipe = new Set(recipes.filter((r) => !r.deletedAt).map((r) => r.productId));
    return products
      .filter((p) => !p.deletedAt && p.active && p.kind === "FINISHED")
      .map((p) => ({ ...p, hasRecipe: withRecipe.has(p.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const product = data?.find((p) => p.id === productId);

  useEffect(() => {
    const value = D(plannedQty);
    if (!productId || value.lessThanOrEqualTo(0)) { setExplosion(null); return; }
    setCalculating(true);
    const timer = setTimeout(() => {
      explodeRecipe(productId, plannedQty)
        .then(setExplosion)
        .catch(() => setExplosion(null))
        .finally(() => setCalculating(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [productId, plannedQty]);

  async function submit() {
    setError(null);
    if (!productId) { setError("Selecione o produto."); return; }
    setBusy(true);
    try {
      const production = await createProduction({ productId, plannedQty, notes, startNow });
      navigate(`/producao/${production.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Nova produção" subtitle="A matéria-prima é calculada pela ficha técnica" />

      <div className="space-y-4">
        <Message error={error} />

        <Card className="space-y-3">
          <Field label="Produto" required>
            <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Selecione o produto</option>
              {(data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.hasRecipe ? "" : " (sem ficha técnica)"}
                </option>
              ))}
            </select>
          </Field>

          {product && !product.hasRecipe && (
            <p className="rounded-xl bg-banana-50 px-3.5 py-3 text-sm text-banana-800">
              Este produto ainda não tem ficha técnica. A produção será registrada, mas sem baixa
              automática de matéria-prima nem custo apurado.{" "}
              <Link to={`/fichas-tecnicas/nova?produto=${product.id}`} className="font-semibold underline">
                Criar ficha técnica
              </Link>
            </p>
          )}

          <Field label={`Quantidade planejada${product ? ` (${product.unit.toLowerCase()})` : ""}`} required>
            <input className="input !text-2xl !font-bold" inputMode="decimal" value={plannedQty}
              onChange={(e) => setPlannedQty(e.target.value)} placeholder="0" />
          </Field>

          {product && (
            <p className="text-xs text-ink-500">
              Estoque atual: <strong>{num(D(product.quantity), 3)} {product.unit.toLowerCase()}</strong>
              {D(product.minStock).greaterThan(0) && ` · mínimo ${num(D(product.minStock), 1)}`}
            </p>
          )}

          <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
            <input type="checkbox" className="h-5 w-5 rounded" checked={startNow}
              onChange={(e) => setStartNow(e.target.checked)} />
            Iniciar imediatamente
          </label>
        </Card>

        {calculating && <p className="text-sm text-ink-500">Calculando matéria-prima…</p>}

        {explosion && (
          <Card pad={false}>
            <div className="border-b border-[var(--border)] px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
                Matéria-prima necessária
              </p>
            </div>
            {explosion.requirements.map((r) => (
              <div key={r.productId} className="row">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-800">{r.name}</p>
                  <p className="text-xs text-ink-500">
                    Disponível {num(r.available, 3)} {r.unit.toLowerCase()}
                    {r.missing.greaterThan(0) && (
                      <span className="font-semibold text-red-600"> · faltam {num(r.missing, 3)}</span>
                    )}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`font-semibold tabular-nums ${r.missing.greaterThan(0) ? "text-red-600" : "text-ink-900"}`}>
                    {num(r.requiredQty, 3)} {r.unit.toLowerCase()}
                  </p>
                  <p className="text-xs text-ink-500">{brl(r.totalCost)}</p>
                </div>
              </div>
            ))}
            <div className="row bg-ink-50">
              <span className="font-bold text-ink-900">Custo estimado</span>
              <div className="text-right">
                <p className="font-bold tabular-nums text-ink-900">{brl(explosion.estimatedCost)}</p>
                <p className="text-xs text-ink-500">{brl(explosion.estimatedUnitCost)} por unidade</p>
              </div>
            </div>
            {explosion.hasShortage && (
              <div className="bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                Falta matéria-prima. Você pode criar a ordem, mas a finalização será bloqueada até
                haver saldo.
              </div>
            )}
          </Card>
        )}

        <Card>
          <Field label="Observações">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional" />
          </Field>
        </Card>

        <Busy busy={busy} onClick={() => void submit()}>Iniciar produção</Busy>
      </div>
    </div>
  );
}
