"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ActionForm } from "@/components/forms";
import { Card, Field } from "@/components/ui";
import { createProductionAction } from "@/app/actions/production";
import { previewRequirements, type RequirementPreview } from "./preview";

type Product = { id: string; name: string; unit: string; hasRecipe: boolean; stock: number; minStock: number };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const nf = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export function NewProductionForm({
  products, defaultProductId, defaultQty,
}: { products: Product[]; defaultProductId: string; defaultQty: string }) {
  const [productId, setProductId] = useState(defaultProductId || products[0]?.id || "");
  const [quantity, setQuantity] = useState(defaultQty);
  const [preview, setPreview] = useState<RequirementPreview | null>(null);
  const [pending, startTransition] = useTransition();

  const product = products.find((p) => p.id === productId);

  useEffect(() => {
    const value = Number(quantity.replace(",", "."));
    if (!productId || !Number.isFinite(value) || value <= 0) { setPreview(null); return; }
    const timer = setTimeout(() => {
      startTransition(async () => setPreview(await previewRequirements(productId, quantity)));
    }, 350);
    return () => clearTimeout(timer);
  }, [productId, quantity]);

  return (
    <ActionForm action={createProductionAction} submitLabel="Iniciar produção" pendingLabel="Criando ordem...">
      <Card className="space-y-3">
        <Field label="Produto" required>
          <select name="productId" className="input" value={productId} onChange={(e) => setProductId(e.target.value)} required>
            <option value="">Selecione o produto</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.hasRecipe ? "" : " (sem ficha técnica)"}</option>
            ))}
          </select>
        </Field>

        {product && !product.hasRecipe && (
          <p className="rounded-xl bg-banana-50 px-3.5 py-3 text-sm text-banana-800">
            Este produto ainda não tem ficha técnica. A produção será registrada, mas sem baixa
            automática de matéria-prima nem custo apurado.{" "}
            <Link href={`/fichas-tecnicas/nova?produto=${product.id}`} className="font-semibold underline">
              Criar ficha técnica
            </Link>
          </p>
        )}

        <Field label={`Quantidade planejada${product ? ` (${product.unit.toLowerCase()})` : ""}`} required>
          <input
            name="plannedQty" className="input !text-2xl !font-bold" inputMode="decimal"
            value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" required
          />
        </Field>

        {product && (
          <p className="text-xs text-ink-500">
            Estoque atual: <strong>{nf(product.stock)} {product.unit.toLowerCase()}</strong>
            {product.minStock > 0 && ` · mínimo ${nf(product.minStock)}`}
          </p>
        )}

        <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
          <input type="checkbox" name="startNow" defaultChecked className="h-5 w-5 rounded" />
          Iniciar imediatamente
        </label>
      </Card>

      {pending && <p className="text-sm text-ink-500">Calculando matéria-prima...</p>}

      {preview && (
        <Card pad={false}>
          <div className="border-b border-[var(--border)] px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Matéria-prima necessária</p>
          </div>
          {preview.requirements.map((r) => (
            <div key={r.productId} className="row">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-800">{r.name}</p>
                <p className="text-xs text-ink-500">
                  Disponível {nf(r.available)} {r.unit.toLowerCase()}
                  {r.missing > 0 && <span className="font-semibold text-red-600"> · faltam {nf(r.missing)}</span>}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`font-semibold tabular-nums ${r.missing > 0 ? "text-red-600" : "text-ink-900"}`}>
                  {nf(r.requiredQty)} {r.unit.toLowerCase()}
                </p>
                <p className="text-xs text-ink-500">{brl(r.totalCost)}</p>
              </div>
            </div>
          ))}
          <div className="row bg-ink-50">
            <span className="font-bold text-ink-900">Custo estimado</span>
            <div className="text-right">
              <p className="font-bold tabular-nums text-ink-900">{brl(preview.estimatedCost)}</p>
              <p className="text-xs text-ink-500">{brl(preview.estimatedUnitCost)} por unidade</p>
            </div>
          </div>
          {preview.hasShortage && (
            <div className="bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              Falta matéria-prima. Você pode criar a ordem, mas a finalização será bloqueada até haver saldo.
            </div>
          )}
        </Card>
      )}

      <Card>
        <Field label="Observações">
          <input name="notes" className="input" placeholder="Opcional" />
        </Field>
      </Card>
    </ActionForm>
  );
}
