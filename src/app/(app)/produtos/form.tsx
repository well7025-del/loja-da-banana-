"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm, ConfirmForm } from "@/components/forms";
import { Card, Field, SectionTitle } from "@/components/ui";
import { deleteProductAction, saveProductAction } from "@/app/actions/products";
import { PRODUCT_KIND_LABELS, UNIT_LABELS } from "@/lib/defaults";

export type ProductFormData = {
  id?: string;
  sku?: string;
  name?: string;
  kind?: string;
  barcode?: string | null;
  description?: string | null;
  categoryName?: string | null;
  unit?: string;
  netWeightKg?: string | null;
  salePrice?: string;
  wholesalePrice?: string;
  targetMargin?: string;
  minStock?: string;
  maxStock?: string | null;
  shelfLifeDays?: string | null;
  trackBatches?: boolean;
  active?: boolean;
  imageUrl?: string | null;
  rawMaterial?: {
    purchaseUnit?: string;
    purchaseFactor?: string;
    standardLossPct?: string;
    leadTimeDays?: string;
    preferredSupplierId?: string | null;
  } | null;
};

export function ProductForm({
  product = {}, suppliers, categories, canDelete, saved,
}: {
  product?: ProductFormData;
  suppliers: { id: string; name: string }[];
  categories: string[];
  canDelete: boolean;
  saved?: boolean;
}) {
  const [kind, setKind] = useState(product.kind ?? "FINISHED");
  const isFinished = kind === "FINISHED" || kind === "RESALE";

  return (
    <ActionForm
      action={saveProductAction}
      submitLabel={product.id ? "Salvar alterações" : "Cadastrar produto"}
      pendingLabel="Salvando..."
      initialMessage={saved ? "Produto salvo com sucesso." : undefined}
    >
      {product.id && <input type="hidden" name="id" value={product.id} />}

      <Card className="space-y-3">
        <Field label="Nome do produto" required>
          <input name="name" className="input" defaultValue={product.name ?? ""} required autoFocus={!product.id} />
        </Field>

        <Field label="Tipo" required>
          <select name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(PRODUCT_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Código interno" hint="Gerado automaticamente se vazio">
            <input name="sku" className="input" defaultValue={product.sku ?? ""} placeholder="PA-006" />
          </Field>
          <Field label="Unidade">
            <select name="unit" className="input" defaultValue={product.unit ?? "KG"}>
              {Object.entries(UNIT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Código de barras">
          <input name="barcode" className="input" inputMode="numeric" defaultValue={product.barcode ?? ""} />
        </Field>

        <Field label="Categoria">
          <input
            name="categoryName" className="input" list="categorias"
            defaultValue={product.categoryName ?? ""} placeholder="Ex.: Snacks de banana"
          />
          <datalist id="categorias">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </Field>
      </Card>

      <SectionTitle>Preços e margem</SectionTitle>
      <Card className="space-y-3">
        {isFinished && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preço de venda (varejo)">
              <input name="salePrice" className="input" inputMode="decimal" defaultValue={product.salePrice ?? ""} placeholder="0,00" />
            </Field>
            <Field label="Preço de atacado">
              <input name="wholesalePrice" className="input" inputMode="decimal" defaultValue={product.wholesalePrice ?? ""} placeholder="0,00" />
            </Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Margem desejada %" hint="Usada na formação de preço">
            <input name="targetMargin" className="input" inputMode="decimal" defaultValue={product.targetMargin ?? ""} placeholder="30" />
          </Field>
          <Field label="Peso líquido (kg)" hint="Para embalagens fechadas">
            <input name="netWeightKg" className="input" inputMode="decimal" defaultValue={product.netWeightKg ?? ""} placeholder="0,100" />
          </Field>
        </div>
        <p className="hint">
          O custo é calculado automaticamente pelo custo médio das compras e pela ficha técnica —
          por isso não é digitado aqui.
        </p>
      </Card>

      <SectionTitle>Estoque e validade</SectionTitle>
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estoque mínimo" hint="Dispara o alerta de reposição">
            <input name="minStock" className="input" inputMode="decimal" defaultValue={product.minStock ?? ""} placeholder="0" />
          </Field>
          <Field label="Estoque máximo">
            <input name="maxStock" className="input" inputMode="decimal" defaultValue={product.maxStock ?? ""} placeholder="—" />
          </Field>
        </div>
        <Field label="Validade (dias)" hint="Prazo a partir da fabricação ou entrada">
          <input name="shelfLifeDays" className="input" inputMode="numeric" defaultValue={product.shelfLifeDays ?? ""} placeholder="180" />
        </Field>
        <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
          <input type="checkbox" name="trackBatches" defaultChecked={product.trackBatches ?? true} className="h-5 w-5 rounded" />
          Controlar por lote (rastreabilidade)
        </label>
        <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
          <input type="checkbox" name="active" defaultChecked={product.active ?? true} className="h-5 w-5 rounded" />
          Produto ativo
        </label>
      </Card>

      {kind === "RAW" && (
        <>
          <SectionTitle>Dados de matéria-prima</SectionTitle>
          <Card className="space-y-3">
            <Field label="Fornecedor preferencial">
              <select name="preferredSupplierId" className="input" defaultValue={product.rawMaterial?.preferredSupplierId ?? ""}>
                <option value="">Sem preferência</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unidade de compra">
                <select name="purchaseUnit" className="input" defaultValue={product.rawMaterial?.purchaseUnit ?? product.unit ?? "KG"}>
                  {Object.entries(UNIT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Fator de conversão" hint="1 unidade de compra = X de estoque">
                <input name="purchaseFactor" className="input" inputMode="decimal" defaultValue={product.rawMaterial?.purchaseFactor ?? "1"} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Perda padrão %" hint="Casca, limpeza, descarte">
                <input name="standardLossPct" className="input" inputMode="decimal" defaultValue={product.rawMaterial?.standardLossPct ?? ""} placeholder="0" />
              </Field>
              <Field label="Prazo de entrega (dias)">
                <input name="leadTimeDays" className="input" inputMode="numeric" defaultValue={product.rawMaterial?.leadTimeDays ?? ""} placeholder="0" />
              </Field>
            </div>
          </Card>
        </>
      )}

      <Card>
        <Field label="Observações">
          <textarea name="description" className="input" rows={3} defaultValue={product.description ?? ""} />
        </Field>
      </Card>

      {product.id && canDelete && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <Link href="/produtos" className="text-sm font-semibold text-ink-500">← Voltar</Link>
          <ConfirmForm
            action={deleteProductAction}
            id={product.id}
            label="Inativar produto"
            question="Inativar este produto? O histórico de estoque e vendas é preservado."
          />
        </div>
      )}
    </ActionForm>
  );
}
