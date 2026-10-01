import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db, newId, nowIso, registerLog } from "@/data/db";
import type { Product, ProductKind, QtyDiscount, Unit } from "@/data/types";
import { D, store } from "@/lib/money";
import { brl, num } from "@/lib/format";
import { PRODUCT_KIND_LABELS, UNIT_LABELS } from "@/lib/defaults";
import { recordPriceChanges } from "@/logic/stock";
import { pickFile, shrinkImage } from "@/logic/files";
import {
  Busy, Card, DocumentPicker, Field, Message, PageHeader, SectionTitle, StatCard,
} from "@/components/ui";

type Form = {
  name: string; kind: ProductKind; sku: string; barcode: string; category: string;
  unit: Unit; netWeightKg: string; salePrice: string; wholesalePrice: string;
  targetMargin: string; minStock: string; maxStock: string; shelfLifeDays: string;
  trackBatches: boolean; active: boolean; supplierName: string; standardLossPct: string;
  notes: string; imageUrl: string; commissionPct: string;
  qtyDiscounts: { minQty: string; discountPct: string }[];
};

const EMPTY: Form = {
  name: "", kind: "FINISHED", sku: "", barcode: "", category: "", unit: "KG",
  netWeightKg: "", salePrice: "", wholesalePrice: "", targetMargin: "", minStock: "",
  maxStock: "", shelfLifeDays: "", trackBatches: true, active: true,
  supplierName: "", standardLossPct: "", notes: "", imageUrl: "", commissionPct: "",
  qtyDiscounts: [],
};

export default function ProductEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(EMPTY);
  const [existing, setExisting] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!id);
  // Trocar preço é lançamento de auditoria: pede motivo e aceita documento.
  const [priceReason, setPriceReason] = useState("");
  const [priceDocument, setPriceDocument] = useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    db.products.get(id).then((product) => {
      if (!product) { setError("Produto não encontrado."); setLoaded(true); return; }
      setExisting(product);
      setForm({
        name: product.name, kind: product.kind, sku: product.sku,
        barcode: product.barcode ?? "", category: product.category ?? "",
        unit: product.unit, netWeightKg: product.netWeightKg ?? "",
        salePrice: D(product.salePrice).toFixed(2),
        wholesalePrice: D(product.wholesalePrice).toFixed(2),
        targetMargin: D(product.targetMargin).toString(),
        minStock: D(product.minStock).toString(),
        maxStock: product.maxStock ?? "",
        shelfLifeDays: product.shelfLifeDays?.toString() ?? "",
        trackBatches: product.trackBatches, active: product.active,
        supplierName: product.supplierName ?? "",
        standardLossPct: D(product.standardLossPct).toString(),
        notes: product.notes ?? "", imageUrl: product.imageUrl ?? "",
        commissionPct: D(product.commissionPct ?? 0).toString(),
        qtyDiscounts: (product.qtyDiscounts ?? []).map((tier) => ({
          minQty: D(tier.minQty).toString(),
          discountPct: D(tier.discountPct).toString(),
        })),
      });
      setLoaded(true);
    });
  }, [id]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function escolherFoto(fromCamera: boolean) {
    setError(null);
    setPhotoBusy(true);
    try {
      const picked = await pickFile("image/*", fromCamera ? "environment" : undefined);
      // A foto é guardada reduzida: ela viaja dentro do backup.
      set("imageUrl", await shrinkImage(picked.file, 900, 0.72));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message !== "Nenhum arquivo escolhido.") setError(message);
    } finally {
      setPhotoBusy(false);
    }
  }

  const precoMudou = Boolean(existing) && (
    !D(existing!.salePrice).equals(D(form.salePrice)) ||
    !D(existing!.wholesalePrice).equals(D(form.wholesalePrice))
  );

  const setTier = (index: number, patch: Partial<{ minQty: string; discountPct: string }>) =>
    setForm((current) => ({
      ...current,
      qtyDiscounts: current.qtyDiscounts.map((tier, i) =>
        (i === index ? { ...tier, ...patch } : tier)),
    }));

  async function save() {
    setError(null); setSuccess(null);
    if (!form.name.trim()) { setError("Informe o nome do produto."); return; }

    setBusy(true);
    try {
      const sku = form.sku.trim() || (await generateSku(form.kind));
      const duplicate = await db.products
        .where("sku").equals(sku)
        .filter((p) => p.id !== id && !p.deletedAt).first();
      if (duplicate) { setError(`Já existe um produto com o código ${sku}.`); setBusy(false); return; }

      const base = {
        name: form.name.trim(), kind: form.kind, sku,
        barcode: form.barcode.trim() || null,
        category: form.category.trim() || null,
        unit: form.unit,
        netWeightKg: form.netWeightKg ? store(form.netWeightKg) : null,
        salePrice: store(form.salePrice), wholesalePrice: store(form.wholesalePrice),
        targetMargin: store(form.targetMargin), minStock: store(form.minStock),
        maxStock: form.maxStock ? store(form.maxStock) : null,
        shelfLifeDays: form.shelfLifeDays ? Number(form.shelfLifeDays) : null,
        trackBatches: form.trackBatches, active: form.active,
        supplierName: form.supplierName.trim() || null,
        standardLossPct: store(form.standardLossPct),
        notes: form.notes.trim() || null,
        imageUrl: form.imageUrl.trim() || null,
        commissionPct: store(form.commissionPct),
        qtyDiscounts: form.qtyDiscounts
          .filter((tier) => D(tier.minQty).greaterThan(0) && D(tier.discountPct).greaterThan(0))
          .map((tier): QtyDiscount => ({
            minQty: store(tier.minQty),
            discountPct: store(tier.discountPct),
          }))
          .sort((a, b) => D(a.minQty).comparedTo(D(b.minQty))),
        updatedAt: nowIso(),
      };

      if (existing) {
        // Registra a troca de preço ANTES de gravar, com o valor antigo em mãos.
        await recordPriceChanges({
          product: existing,
          salePrice: base.salePrice,
          wholesalePrice: base.wholesalePrice,
          reason: priceReason,
          document: priceDocument,
        });
        await db.products.update(existing.id, base);
        await registerLog("UPDATE", "Produto", `Atualizou ${base.name} (${sku})`, existing.id);
        setSuccess("Produto salvo.");
        setExisting({ ...existing, ...base } as Product);
        setPriceReason("");
        setPriceDocument(null);
      } else {
        const product: Product = {
          ...base, id: newId(), avgCost: "0", lastCost: "0", quantity: "0",
          deletedAt: null, createdAt: nowIso(),
        };
        await db.products.add(product);
        await registerLog("CREATE", "Produto", `Cadastrou ${product.name} (${sku})`, product.id);
        navigate(`/produtos/${product.id}`, { replace: true });
        setSuccess("Produto cadastrado.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function inativar() {
    if (!existing) return;
    if (!window.confirm("Inativar este produto? O histórico de estoque e vendas é preservado.")) return;
    await db.products.update(existing.id, { deletedAt: nowIso(), active: false });
    await registerLog("DELETE", "Produto", `Inativou ${existing.name}`, existing.id);
    navigate("/produtos");
  }

  if (!loaded) return <p className="py-8 text-center text-sm text-ink-500">Carregando…</p>;

  const isFinished = form.kind === "FINISHED" || form.kind === "RESALE";

  return (
    <div>
      <PageHeader
        title={existing ? existing.name : "Novo produto"}
        subtitle={existing ? existing.sku : "Produto acabado, matéria-prima ou embalagem"}
      />

      {existing && (
        <div className="mb-3 grid grid-cols-3 gap-2.5">
          <StatCard label="Em estoque" value={num(D(existing.quantity), 1)} hint={existing.unit.toLowerCase()} />
          <StatCard label="Custo médio" value={brl(existing.avgCost)} hint="por unidade" />
          <StatCard label="Preço de venda" value={brl(existing.salePrice)} />
        </div>
      )}

      <div className="space-y-4">
        <Message error={error} success={success} />

        <Card className="space-y-3">
          <Field label="Nome do produto" required>
            <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Tipo" required>
            <select className="input" value={form.kind} onChange={(e) => set("kind", e.target.value as ProductKind)}>
              {Object.entries(PRODUCT_KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código interno" hint="Gerado se vazio">
              <input className="input" value={form.sku} onChange={(e) => set("sku", e.target.value)} />
            </Field>
            <Field label="Unidade">
              <select className="input" value={form.unit} onChange={(e) => set("unit", e.target.value as Unit)}>
                {Object.entries(UNIT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Código de barras">
            <input className="input" inputMode="numeric" value={form.barcode}
              onChange={(e) => set("barcode", e.target.value)} />
          </Field>
          <Field label="Categoria">
            <input className="input" value={form.category} onChange={(e) => set("category", e.target.value)}
              placeholder="Ex.: Snacks de banana" />
          </Field>

          <div className="field">
            <span className="label">Foto do produto</span>
            {form.imageUrl ? (
              <div className="flex items-start gap-3">
                <img src={form.imageUrl} alt={`Foto de ${form.name || "produto"}`}
                  className="h-24 w-24 shrink-0 rounded-xl object-cover ring-1 ring-[var(--border)]" />
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => void escolherFoto(true)}
                    className="btn-ghost btn-sm">Tirar outra</button>
                  <button type="button" onClick={() => set("imageUrl", "")}
                    className="btn-ghost btn-sm !text-red-600">Remover</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={photoBusy} onClick={() => void escolherFoto(true)}
                  className="rounded-xl border border-dashed border-[var(--border)] bg-white px-3 py-4 text-sm font-semibold text-ink-600 active:bg-ink-50">
                  📷 Tirar foto
                </button>
                <button type="button" disabled={photoBusy} onClick={() => void escolherFoto(false)}
                  className="rounded-xl border border-dashed border-[var(--border)] bg-white px-3 py-4 text-sm font-semibold text-ink-600 active:bg-ink-50">
                  🖼️ Escolher da galeria
                </button>
              </div>
            )}
            <span className="hint">
              {photoBusy ? "Preparando a imagem…" : "A foto é reduzida antes de ser guardada."}
            </span>
          </div>
        </Card>

        <SectionTitle>Preços e margem</SectionTitle>
        <Card className="space-y-3">
          {isFinished && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Preço de venda">
                <input className="input" inputMode="decimal" value={form.salePrice}
                  onChange={(e) => set("salePrice", e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Preço de atacado">
                <input className="input" inputMode="decimal" value={form.wholesalePrice}
                  onChange={(e) => set("wholesalePrice", e.target.value)} placeholder="0,00" />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Margem desejada %">
              <input className="input" inputMode="decimal" value={form.targetMargin}
                onChange={(e) => set("targetMargin", e.target.value)} placeholder="30" />
            </Field>
            <Field label="Peso líquido (kg)" hint="Para embalagens fechadas">
              <input className="input" inputMode="decimal" value={form.netWeightKg}
                onChange={(e) => set("netWeightKg", e.target.value)} placeholder="0,100" />
            </Field>
          </div>
          {isFinished && (
            <Field label="Comissão sobre a venda %"
              hint="Usada no relatório de comissões por produto">
              <input className="input" inputMode="decimal" value={form.commissionPct}
                onChange={(e) => set("commissionPct", e.target.value)} placeholder="0" />
            </Field>
          )}
          <p className="hint">
            O custo não é digitado: ele vem do custo médio das entradas e da ficha técnica.
          </p>

          {precoMudou && (
            <div className="space-y-3 rounded-xl bg-banana-50 p-3 ring-1 ring-banana-200">
              <p className="text-sm font-semibold text-banana-900">
                Você está alterando o preço. A alteração fica registrada no relatório
                de auditoria.
              </p>
              <Field label="Motivo da alteração" required>
                <input className="input" value={priceReason}
                  onChange={(e) => setPriceReason(e.target.value)}
                  placeholder="Ex.: aumento do custo da banana" />
              </Field>
              <DocumentPicker file={priceDocument} onPick={setPriceDocument}
                label="Documento que autoriza"
                hint="Opcional — foto do bilhete, planilha aprovada ou PDF." />
            </div>
          )}
        </Card>

        {isFinished && (
          <>
            <SectionTitle>Desconto por quantidade</SectionTitle>
            <Card className="space-y-3">
              <p className="text-sm text-ink-600">
                Aplicado sozinho na venda quando a quantidade alcançar a faixa.
                Ex.: a partir de 5 {UNIT_LABELS[form.unit] ?? ""}, 5% de desconto.
              </p>

              {form.qtyDiscounts.map((tier, index) => (
                <div key={index} className="flex items-end gap-2">
                  <label className="flex-1 text-xs font-semibold text-ink-500">
                    A partir de ({UNIT_LABELS[form.unit] ?? "un"})
                    <input className="input mt-1 !min-h-[2.5rem] text-sm" inputMode="decimal"
                      value={tier.minQty} onChange={(e) => setTier(index, { minQty: e.target.value })}
                      placeholder="5" />
                  </label>
                  <label className="flex-1 text-xs font-semibold text-ink-500">
                    Desconto %
                    <input className="input mt-1 !min-h-[2.5rem] text-sm" inputMode="decimal"
                      value={tier.discountPct}
                      onChange={(e) => setTier(index, { discountPct: e.target.value })}
                      placeholder="5" />
                  </label>
                  <button type="button" className="mb-1 shrink-0 px-2 text-sm font-semibold text-red-600"
                    onClick={() => setForm((current) => ({
                      ...current,
                      qtyDiscounts: current.qtyDiscounts.filter((_, i) => i !== index),
                    }))}>
                    Tirar
                  </button>
                </div>
              ))}

              <button type="button" className="btn-ghost w-full"
                onClick={() => setForm((current) => ({
                  ...current,
                  qtyDiscounts: [...current.qtyDiscounts, { minQty: "", discountPct: "" }],
                }))}>
                + Adicionar faixa
              </button>

              {form.qtyDiscounts.length === 0 && (
                <p className="hint">
                  Sem faixas aqui, valem as regras gerais de atacado da tela de preços.
                </p>
              )}
            </Card>
          </>
        )}

        <SectionTitle>Estoque e validade</SectionTitle>
        <Card className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estoque mínimo" hint="Dispara o alerta">
              <input className="input" inputMode="decimal" value={form.minStock}
                onChange={(e) => set("minStock", e.target.value)} placeholder="0" />
            </Field>
            <Field label="Estoque máximo">
              <input className="input" inputMode="decimal" value={form.maxStock}
                onChange={(e) => set("maxStock", e.target.value)} placeholder="—" />
            </Field>
          </div>
          <Field label="Validade (dias)" hint="A partir da fabricação ou entrada">
            <input className="input" inputMode="numeric" value={form.shelfLifeDays}
              onChange={(e) => set("shelfLifeDays", e.target.value)} placeholder="180" />
          </Field>
          <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
            <input type="checkbox" className="h-5 w-5 rounded" checked={form.trackBatches}
              onChange={(e) => set("trackBatches", e.target.checked)} />
            Controlar por lote (rastreabilidade)
          </label>
          <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
            <input type="checkbox" className="h-5 w-5 rounded" checked={form.active}
              onChange={(e) => set("active", e.target.checked)} />
            Produto ativo
          </label>
        </Card>

        {form.kind === "RAW" && (
          <>
            <SectionTitle>Matéria-prima</SectionTitle>
            <Card className="space-y-3">
              <Field label="Fornecedor habitual">
                <input className="input" value={form.supplierName}
                  onChange={(e) => set("supplierName", e.target.value)} />
              </Field>
              <Field label="Perda padrão %" hint="Casca, limpeza, descarte">
                <input className="input" inputMode="decimal" value={form.standardLossPct}
                  onChange={(e) => set("standardLossPct", e.target.value)} placeholder="0" />
              </Field>
            </Card>
          </>
        )}

        <Card className="space-y-3">
          <Field label="Observações">
            <textarea className="input" rows={3} value={form.notes}
              onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </Card>

        <Busy busy={busy} onClick={() => void save()}>
          {existing ? "Salvar alterações" : "Cadastrar produto"}
        </Busy>

        {existing && (
          <button type="button" onClick={() => void inativar()} className="btn-ghost w-full !text-red-600">
            Inativar produto
          </button>
        )}
      </div>
    </div>
  );
}

async function generateSku(kind: ProductKind): Promise<string> {
  const prefix = { FINISHED: "PA", RAW: "MP", PACKAGING: "EM", RESALE: "RV" }[kind];
  const all = await db.products.toArray();
  const numbers = all
    .filter((p) => p.sku.startsWith(`${prefix}-`))
    .map((p) => Number(p.sku.split("-")[1]))
    .filter((n) => Number.isFinite(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}
