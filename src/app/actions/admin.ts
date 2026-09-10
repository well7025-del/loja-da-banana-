"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { money, pct, qty } from "@/lib/money";
import { saveSettings } from "@/server/services/settings";
import type { CompanySettings } from "@/lib/defaults";
import { type ActionState, bool, optional, str, toActionError } from "./_helpers";
import type { CustomerType, PriceRuleType, SaleChannel } from "@prisma/client";

export async function saveSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("settings.update");
    const keys: (keyof CompanySettings)[] = [
      "taxPct", "fixedOverheadPct", "commissionPct", "cardFeePct", "defaultTargetMarginPct",
      "allowNegativeStock", "expiryAlertDays", "inactiveCustomerDays",
      "productionCoverageDays", "purchaseCoverageDays",
    ];
    const values: Partial<CompanySettings> = {};
    for (const key of keys) {
      if (key === "allowNegativeStock") values[key] = String(bool(form, key));
      else if (form.has(key)) values[key] = str(form, key).replace(",", ".");
    }
    await saveSettings(user.companyId, values);
    await audit({ user, action: "UPDATE", entity: "Setting", summary: "Atualizou os parâmetros do sistema", after: values });
    revalidatePath("/configuracoes");
    return { success: "Parâmetros salvos." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function savePriceRuleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = str(form, "id");
    const user = await requirePermission("pricing.update");
    const name = str(form, "name");
    if (!name) return { error: "Dê um nome à regra (ex.: Atacado acima de 5 kg)." };

    const data = {
      name,
      type: (str(form, "type") || "QTY_DISCOUNT") as PriceRuleType,
      minQty: qty(str(form, "minQty")),
      minValue: money(str(form, "minValue")),
      discountPct: pct(str(form, "discountPct")),
      customerType: (optional(form, "customerType") as CustomerType | null) ?? null,
      channel: (optional(form, "channel") as SaleChannel | null) ?? null,
      productId: optional(form, "productId"),
      priority: Number(str(form, "priority") || 0),
      active: bool(form, "active"),
    };

    const rule = id
      ? await prisma.priceRule.update({ where: { id }, data })
      : await prisma.priceRule.create({ data: { ...data, companyId: user.companyId } });

    await audit({
      user, action: id ? "UPDATE" : "CREATE", entity: "PriceRule", entityId: rule.id,
      summary: `${id ? "Atualizou" : "Criou"} a regra de desconto "${rule.name}" (${rule.discountPct}%)`,
      after: data,
    });
    revalidatePath("/configuracoes/descontos");
    return { success: "Regra de desconto salva." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deletePriceRuleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("pricing.delete");
    const id = str(form, "id");
    const rule = await prisma.priceRule.findFirstOrThrow({ where: { id, companyId: user.companyId } });
    await prisma.priceRule.delete({ where: { id } });
    await audit({ user, action: "DELETE", entity: "PriceRule", entityId: id, summary: `Removeu a regra "${rule.name}"`, before: rule });
    revalidatePath("/configuracoes/descontos");
    return { success: "Regra removida." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveUserAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = str(form, "id");
    const user = await requirePermission(id ? "users.update" : "users.create");
    const name = str(form, "name");
    const email = str(form, "email").toLowerCase();
    if (!name || !email) return { error: "Informe nome e e-mail." };

    const roleId = str(form, "roleId");
    if (!roleId) return { error: "Selecione o perfil de acesso." };

    const password = str(form, "password");
    if (!id && password.length < 8) {
      return { error: "Defina uma senha inicial com ao menos 8 caracteres." };
    }

    const base = {
      name, email, roleId,
      phone: optional(form, "phone"),
      active: bool(form, "active"),
    };

    const saved = id
      ? await prisma.user.update({
          where: { id },
          data: {
            ...base,
            ...(password.length >= 8
              ? { passwordHash: await hashPassword(password), mustChangePassword: true }
              : {}),
          },
        })
      : await prisma.user.create({
          data: {
            ...base,
            companyId: user.companyId,
            passwordHash: await hashPassword(password),
            mustChangePassword: true,
          },
        });

    await audit({
      user, action: id ? "UPDATE" : "CREATE", entity: "User", entityId: saved.id,
      summary: `${id ? "Atualizou" : "Cadastrou"} o usuário ${saved.name} (${saved.email})`,
    });
    revalidatePath("/usuarios");
    return { success: `Usuário ${saved.name} salvo.` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deactivateUserAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("users.delete");
    const id = str(form, "id");
    if (id === user.id) return { error: "Você não pode desativar o próprio usuário." };
    const target = await prisma.user.findFirstOrThrow({ where: { id, companyId: user.companyId } });
    await prisma.user.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
    await prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ user, action: "DELETE", entity: "User", entityId: id, summary: `Desativou o usuário ${target.name}` });
    revalidatePath("/usuarios");
    return { success: `${target.name} foi desativado e suas sessões encerradas.` };
  } catch (error) {
    return toActionError(error);
  }
}
