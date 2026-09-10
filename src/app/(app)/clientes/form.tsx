"use client";

import Link from "next/link";
import { ActionForm, ConfirmForm } from "@/components/forms";
import { Card, Field, SectionTitle } from "@/components/ui";
import { deleteCustomerAction, saveCustomerAction } from "@/app/actions/partners";
import { CUSTOMER_TYPE_LABELS } from "@/lib/defaults";

export type CustomerFormData = Partial<{
  id: string; name: string; legalName: string | null; taxId: string | null; type: string;
  phone: string | null; whatsapp: string | null; email: string | null; city: string | null;
  state: string | null; address: string | null; creditLimit: string; paymentTerms: string | null;
  defaultDiscountPct: string; notes: string | null; active: boolean;
}>;

export function CustomerForm({ customer = {}, canDelete, saved }: {
  customer?: CustomerFormData; canDelete: boolean; saved?: boolean;
}) {
  return (
    <ActionForm
      action={saveCustomerAction}
      submitLabel={customer.id ? "Salvar alterações" : "Cadastrar cliente"}
      initialMessage={saved ? "Cliente salvo com sucesso." : undefined}
    >
      {customer.id && <input type="hidden" name="id" value={customer.id} />}

      <Card className="space-y-3">
        <Field label="Nome / Razão social" required>
          <input name="name" className="input" defaultValue={customer.name ?? ""} required autoFocus={!customer.id} />
        </Field>
        <Field label="Tipo de cliente">
          <select name="type" className="input" defaultValue={customer.type ?? "CONSUMER"}>
            {Object.entries(CUSTOMER_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="CPF / CNPJ">
          <input name="taxId" className="input" inputMode="numeric" defaultValue={customer.taxId ?? ""} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Telefone">
            <input name="phone" type="tel" className="input" inputMode="tel" defaultValue={customer.phone ?? ""} />
          </Field>
          <Field label="WhatsApp">
            <input name="whatsapp" type="tel" className="input" inputMode="tel" defaultValue={customer.whatsapp ?? ""} />
          </Field>
        </div>
        <Field label="E-mail">
          <input name="email" type="email" className="input" defaultValue={customer.email ?? ""} />
        </Field>
      </Card>

      <SectionTitle>Endereço</SectionTitle>
      <Card className="space-y-3">
        <Field label="Endereço">
          <input name="address" className="input" defaultValue={customer.address ?? ""} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Cidade"><input name="city" className="input" defaultValue={customer.city ?? ""} /></Field>
          <Field label="UF"><input name="state" className="input" maxLength={2} defaultValue={customer.state ?? ""} /></Field>
        </div>
      </Card>

      <SectionTitle>Condições comerciais</SectionTitle>
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Limite de crédito" hint="0 = sem limite">
            <input name="creditLimit" className="input" inputMode="decimal" defaultValue={customer.creditLimit ?? ""} placeholder="0,00" />
          </Field>
          <Field label="Desconto padrão %">
            <input name="defaultDiscountPct" className="input" inputMode="decimal" defaultValue={customer.defaultDiscountPct ?? ""} placeholder="0" />
          </Field>
        </div>
        <Field label="Condição de pagamento">
          <input name="paymentTerms" className="input" defaultValue={customer.paymentTerms ?? ""} placeholder="Ex.: 28 dias, à vista" />
        </Field>
        <Field label="Observações">
          <textarea name="notes" className="input" rows={3} defaultValue={customer.notes ?? ""} />
        </Field>
        <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
          <input type="checkbox" name="active" defaultChecked={customer.active ?? true} className="h-5 w-5 rounded" />
          Cliente ativo
        </label>
      </Card>

      {customer.id && canDelete && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <Link href="/clientes" className="text-sm font-semibold text-ink-500">← Voltar</Link>
          <ConfirmForm action={deleteCustomerAction} id={customer.id} label="Inativar cliente"
            question="Inativar este cliente? O histórico de vendas é preservado." />
        </div>
      )}
    </ActionForm>
  );
}
