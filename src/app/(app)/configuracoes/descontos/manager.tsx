"use client";

import { useState } from "react";
import { ActionForm, ConfirmForm } from "@/components/forms";
import { Badge, Card, Field } from "@/components/ui";
import { deletePriceRuleAction, savePriceRuleAction } from "@/app/actions/admin";
import { CUSTOMER_TYPE_LABELS } from "@/lib/defaults";

export type RuleRow = {
  id: string; name: string; type: string; minQty: string; minValue: string;
  discountPct: string; channel: string | null; customerType: string | null;
  productId: string | null; productName: string | null; priority: number; active: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  QTY_DISCOUNT: "Por quantidade",
  ORDER_VALUE: "Por valor do pedido",
  CUSTOMER_TYPE: "Por tipo de cliente",
};

export function PriceRulesManager({
  rules, products, canEdit, canDelete,
}: {
  rules: RuleRow[];
  products: { id: string; name: string }[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState<RuleRow | null>(null);
  const [creating, setCreating] = useState(false);
  const form = editing ?? null;

  return (
    <div className="space-y-3">
      {rules.length === 0 && (
        <Card><p className="text-sm text-ink-500">Nenhuma regra cadastrada. Sem regras, nenhum desconto automático é aplicado.</p></Card>
      )}

      {rules.map((rule) => (
        <Card key={rule.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink-900">{rule.name}</span>
                {!rule.active && <Badge>inativa</Badge>}
                <Badge tone="blue">{TYPE_LABELS[rule.type]}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-600">
                {rule.type === "QTY_DISCOUNT" && `A partir de ${rule.minQty} unidades`}
                {rule.type === "ORDER_VALUE" && `Pedidos acima de R$ ${rule.minValue}`}
                {rule.type === "CUSTOMER_TYPE" && `Clientes do tipo ${CUSTOMER_TYPE_LABELS[rule.customerType ?? ""] ?? "—"}`}
                {" → "}<strong className="text-leaf-700">{rule.discountPct}% de desconto</strong>
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {rule.channel === "WHOLESALE" ? "Somente atacado" : rule.channel === "RETAIL" ? "Somente varejo" : "Varejo e atacado"}
                {rule.productName && ` · apenas ${rule.productName}`}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => { setEditing(editing?.id === rule.id ? null : rule); setCreating(false); }}
                  className="btn-ghost btn-sm"
                >
                  {editing?.id === rule.id ? "Fechar" : "Editar"}
                </button>
              )}
              {canDelete && (
                <ConfirmForm action={deletePriceRuleAction} id={rule.id} label="Excluir"
                  question={`Excluir a regra "${rule.name}"?`} />
              )}
            </div>
          </div>

          {editing?.id === rule.id && <RuleForm rule={rule} products={products} onDone={() => setEditing(null)} />}
        </Card>
      ))}

      {canEdit && (
        creating ? (
          <Card>
            <p className="mb-2 font-semibold text-ink-900">Nova regra</p>
            <RuleForm products={products} onDone={() => setCreating(false)} />
          </Card>
        ) : (
          <button type="button" onClick={() => { setCreating(true); setEditing(null); }} className="btn-banana w-full">
            + Nova regra de desconto
          </button>
        )
      )}
    </div>
  );
}

function RuleForm({
  rule, products, onDone,
}: { rule?: RuleRow; products: { id: string; name: string }[]; onDone: () => void }) {
  const [type, setType] = useState(rule?.type ?? "QTY_DISCOUNT");

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      <ActionForm action={savePriceRuleAction} submitLabel="Salvar regra" footer={
        <button type="button" onClick={onDone} className="btn-ghost w-full">Cancelar</button>
      }>
        {rule && <input type="hidden" name="id" value={rule.id} />}
        <Field label="Nome da regra" required>
          <input name="name" className="input" defaultValue={rule?.name ?? ""} required placeholder="Ex.: Atacado acima de 5 kg" />
        </Field>
        <Field label="Tipo">
          <select name="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {type === "QTY_DISCOUNT" && (
            <Field label="Quantidade mínima" required>
              <input name="minQty" className="input" inputMode="decimal" defaultValue={rule?.minQty ?? ""} placeholder="5" />
            </Field>
          )}
          {type === "ORDER_VALUE" && (
            <Field label="Valor mínimo do pedido" required>
              <input name="minValue" className="input" inputMode="decimal" defaultValue={rule?.minValue ?? ""} placeholder="500,00" />
            </Field>
          )}
          <Field label="Desconto %" required>
            <input name="discountPct" className="input" inputMode="decimal" defaultValue={rule?.discountPct ?? ""} placeholder="5" required />
          </Field>
        </div>
        <Field label="Aplicar em">
          <select name="channel" className="input" defaultValue={rule?.channel ?? ""}>
            <option value="">Varejo e atacado</option>
            <option value="RETAIL">Somente varejo</option>
            <option value="WHOLESALE">Somente atacado</option>
          </select>
        </Field>
        <Field label="Tipo de cliente" hint="Deixe vazio para valer para todos">
          <select name="customerType" className="input" defaultValue={rule?.customerType ?? ""}>
            <option value="">Todos os clientes</option>
            {Object.entries(CUSTOMER_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Produto específico" hint="Deixe vazio para valer para todos">
          <select name="productId" className="input" defaultValue={rule?.productId ?? ""}>
            <option value="">Todos os produtos</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
          <input type="checkbox" name="active" defaultChecked={rule?.active ?? true} className="h-5 w-5 rounded" />
          Regra ativa
        </label>
      </ActionForm>
    </div>
  );
}
