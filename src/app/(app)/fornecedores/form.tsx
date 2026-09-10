"use client";

import Link from "next/link";
import { ActionForm, ConfirmForm } from "@/components/forms";
import { Card, Field, SectionTitle } from "@/components/ui";
import { deleteSupplierAction, saveSupplierAction } from "@/app/actions/partners";

export type SupplierFormData = Partial<{
  id: string; name: string; legalName: string | null; taxId: string | null; phone: string | null;
  whatsapp: string | null; contactName: string | null; email: string | null; city: string | null;
  state: string | null; address: string | null; suppliedItems: string | null;
  avgLeadTimeDays: string; paymentTerms: string | null; notes: string | null; active: boolean;
}>;

export function SupplierForm({ supplier = {}, canDelete, saved }: {
  supplier?: SupplierFormData; canDelete: boolean; saved?: boolean;
}) {
  return (
    <ActionForm
      action={saveSupplierAction}
      submitLabel={supplier.id ? "Salvar alterações" : "Cadastrar fornecedor"}
      initialMessage={saved ? "Fornecedor salvo com sucesso." : undefined}
    >
      {supplier.id && <input type="hidden" name="id" value={supplier.id} />}

      <Card className="space-y-3">
        <Field label="Nome" required>
          <input name="name" className="input" defaultValue={supplier.name ?? ""} required autoFocus={!supplier.id} />
        </Field>
        <Field label="Razão social">
          <input name="legalName" className="input" defaultValue={supplier.legalName ?? ""} />
        </Field>
        <Field label="CNPJ / CPF">
          <input name="taxId" className="input" inputMode="numeric" defaultValue={supplier.taxId ?? ""} />
        </Field>
        <Field label="Pessoa de contato">
          <input name="contactName" className="input" defaultValue={supplier.contactName ?? ""} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Telefone"><input name="phone" type="tel" className="input" inputMode="tel" defaultValue={supplier.phone ?? ""} /></Field>
          <Field label="WhatsApp"><input name="whatsapp" type="tel" className="input" inputMode="tel" defaultValue={supplier.whatsapp ?? ""} /></Field>
        </div>
        <Field label="E-mail"><input name="email" type="email" className="input" defaultValue={supplier.email ?? ""} /></Field>
      </Card>

      <SectionTitle>Endereço e fornecimento</SectionTitle>
      <Card className="space-y-3">
        <Field label="Endereço"><input name="address" className="input" defaultValue={supplier.address ?? ""} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Cidade"><input name="city" className="input" defaultValue={supplier.city ?? ""} /></Field>
          <Field label="UF"><input name="state" className="input" maxLength={2} defaultValue={supplier.state ?? ""} /></Field>
        </div>
        <Field label="Produtos fornecidos">
          <textarea name="suppliedItems" className="input" rows={2} defaultValue={supplier.suppliedItems ?? ""} placeholder="Ex.: banana verde, banana madura" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prazo médio (dias)">
            <input name="avgLeadTimeDays" className="input" inputMode="numeric" defaultValue={supplier.avgLeadTimeDays ?? ""} placeholder="0" />
          </Field>
          <Field label="Condição de pagamento">
            <input name="paymentTerms" className="input" defaultValue={supplier.paymentTerms ?? ""} placeholder="Ex.: 30 dias" />
          </Field>
        </div>
        <Field label="Observações">
          <textarea name="notes" className="input" rows={2} defaultValue={supplier.notes ?? ""} />
        </Field>
        <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
          <input type="checkbox" name="active" defaultChecked={supplier.active ?? true} className="h-5 w-5 rounded" />
          Fornecedor ativo
        </label>
      </Card>

      {supplier.id && canDelete && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <Link href="/fornecedores" className="text-sm font-semibold text-ink-500">← Voltar</Link>
          <ConfirmForm action={deleteSupplierAction} id={supplier.id} label="Inativar fornecedor"
            question="Inativar este fornecedor? O histórico de compras é preservado." />
        </div>
      )}
    </ActionForm>
  );
}
