"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { money, pct } from "@/lib/money";
import { type ActionState, bool, optional, str, toActionError } from "./_helpers";
import type { CustomerType } from "@prisma/client";

export async function saveCustomerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = "";
  try {
    const id = str(form, "id");
    const user = await requirePermission(id ? "customers.update" : "customers.create");
    const name = str(form, "name");
    if (!name) return { error: "Informe o nome do cliente." };

    const data = {
      name,
      legalName: optional(form, "legalName"),
      taxId: optional(form, "taxId"),
      type: (str(form, "type") || "CONSUMER") as CustomerType,
      phone: optional(form, "phone"),
      whatsapp: optional(form, "whatsapp"),
      email: optional(form, "email"),
      city: optional(form, "city"),
      state: optional(form, "state"),
      address: optional(form, "address"),
      creditLimit: money(str(form, "creditLimit")),
      paymentTerms: optional(form, "paymentTerms"),
      defaultDiscountPct: pct(str(form, "defaultDiscountPct")),
      notes: optional(form, "notes"),
      active: bool(form, "active"),
    };

    const customer = id
      ? await prisma.customer.update({ where: { id }, data })
      : await prisma.customer.create({ data: { ...data, companyId: user.companyId } });

    await audit({
      user, action: id ? "UPDATE" : "CREATE", entity: "Customer", entityId: customer.id,
      summary: `${id ? "Atualizou" : "Cadastrou"} o cliente ${customer.name}`,
    });
    revalidatePath("/clientes");
    target = `/clientes/${customer.id}?ok=1`;
  } catch (error) {
    return toActionError(error);
  }
  redirect(target);
}

export async function deleteCustomerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("customers.delete");
    const id = str(form, "id");
    const customer = await prisma.customer.findFirstOrThrow({ where: { id, companyId: user.companyId } });
    await prisma.customer.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await audit({ user, action: "DELETE", entity: "Customer", entityId: id, summary: `Inativou o cliente ${customer.name}` });
    revalidatePath("/clientes");
    return { success: `${customer.name} foi inativado.` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveSupplierAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = "";
  try {
    const id = str(form, "id");
    const user = await requirePermission(id ? "suppliers.update" : "suppliers.create");
    const name = str(form, "name");
    if (!name) return { error: "Informe o nome do fornecedor." };

    const data = {
      name,
      legalName: optional(form, "legalName"),
      taxId: optional(form, "taxId"),
      phone: optional(form, "phone"),
      whatsapp: optional(form, "whatsapp"),
      contactName: optional(form, "contactName"),
      email: optional(form, "email"),
      city: optional(form, "city"),
      state: optional(form, "state"),
      address: optional(form, "address"),
      suppliedItems: optional(form, "suppliedItems"),
      avgLeadTimeDays: Number(str(form, "avgLeadTimeDays") || 0),
      paymentTerms: optional(form, "paymentTerms"),
      notes: optional(form, "notes"),
      active: bool(form, "active"),
    };

    const supplier = id
      ? await prisma.supplier.update({ where: { id }, data })
      : await prisma.supplier.create({ data: { ...data, companyId: user.companyId } });

    await audit({
      user, action: id ? "UPDATE" : "CREATE", entity: "Supplier", entityId: supplier.id,
      summary: `${id ? "Atualizou" : "Cadastrou"} o fornecedor ${supplier.name}`,
    });
    revalidatePath("/fornecedores");
    target = `/fornecedores/${supplier.id}?ok=1`;
  } catch (error) {
    return toActionError(error);
  }
  redirect(target);
}

export async function deleteSupplierAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("suppliers.delete");
    const id = str(form, "id");
    const supplier = await prisma.supplier.findFirstOrThrow({ where: { id, companyId: user.companyId } });
    await prisma.supplier.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await audit({ user, action: "DELETE", entity: "Supplier", entityId: id, summary: `Inativou o fornecedor ${supplier.name}` });
    revalidatePath("/fornecedores");
    return { success: `${supplier.name} foi inativado.` };
  } catch (error) {
    return toActionError(error);
  }
}
