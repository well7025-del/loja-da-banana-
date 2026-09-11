import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db, newId, nowIso, registerLog } from "@/data/db";
import type { Product, ProductKind, Unit } from "@/data/types";
import { D, store } from "@/lib/money";
import { brl, num } from "@/lib/format";
import { PRODUCT_KIND_LABELS, UNIT_LABELS } from "@/lib/defaults";
import { Busy, Card, Field, Message, PageHeader, SectionTitle, StatCard } from "@/components/ui";

type Form = {
  name: string; kind: ProductKind; sku: string; barcode: string; category: string;
  unit: Unit; netWeightKg: string; salePrice: string; wholesalePrice: string;
  targetMargin: string; minStock: string; maxStock: string; shelfLifeDays: string;
  trackBatches: boolean; active: boolean; supplierName: string; standardLossPct: string;
  notes: string; imageUrl: string;
};

const EMPTY: Form = {
  name: "", kind: "FINISHED", sku: "", barcode: "", category: "", unit: "KG",
  netWeightKg: "", salePrice: "", wholesalePrice: "", targetMargin: "", minStock: "",
  maxStock: "", shelfLifeDays: "", trackBatches: true, active: true,
  supplierName: "", standardLossPct: "", notes: "", imageUrl: "",
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
      });
      setLoaded(true);
    });
  }, [id]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

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
        updatedAt: nowIso(),
      };

      if (existing) {
        await db.products.update(existing.id, base);
        await registerLog("UPDATE", "Produto", `Atualizou ${base.name} (${sku})`, existing.id);
        setSuccess("Produto salvo.");
        setExisting({ ...existing, ...base } as Product);
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
          <p className="hint">
            O custo não é digitado: ele vem do custo médio das entradas e da ficha técnica.
          </p>
        </Card>

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
