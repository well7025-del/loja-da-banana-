import "server-only";
import { prisma } from "@/lib/db";
import { D, ZERO } from "@/lib/money";
import type { PickableProduct, DiscountRule } from "@/components/items-editor";
import type { ProductKind } from "@prisma/client";

/** Produtos prontos para os seletores do cliente (serializados como números). */
export async function pickableProducts(
  companyId: string,
  kinds: ProductKind[] = ["FINISHED", "RESALE"],
): Promise<PickableProduct[]> {
  const products = await prisma.product.findMany({
    where: { companyId, deletedAt: null, active: true, kind: { in: kinds } },
    include: { inventory: true },
    orderBy: { name: "asc" },
  });
  return products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    unit: p.unit,
    barcode: p.barcode,
    salePrice: D(p.salePrice).toNumber(),
    wholesalePrice: D(p.wholesalePrice).toNumber(),
    avgCost: D(p.avgCost).toNumber(),
    stock: p.inventory.reduce((a, i) => a.plus(D(i.quantity)), ZERO).toNumber(),
  }));
}

export async function serializedPriceRules(companyId: string): Promise<DiscountRule[]> {
  const rules = await prisma.priceRule.findMany({ where: { companyId, active: true } });
  return rules.map((r) => ({
    type: r.type,
    minQty: D(r.minQty).toNumber(),
    minValue: D(r.minValue).toNumber(),
    discountPct: D(r.discountPct).toNumber(),
    channel: r.channel,
    customerType: r.customerType,
    productId: r.productId,
  }));
}

export const activeCustomers = (companyId: string) =>
  prisma.customer.findMany({
    where: { companyId, deletedAt: null, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, defaultDiscountPct: true, creditLimit: true },
  });

export const activeSuppliers = (companyId: string) =>
  prisma.supplier.findMany({
    where: { companyId, deletedAt: null, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

export const defaultWarehouse = (companyId: string) =>
  prisma.warehouse.findFirstOrThrow({ where: { companyId, isDefault: true } });

export const financeCategories = () =>
  prisma.financeCategory.findMany({ orderBy: [{ direction: "asc" }, { name: "asc" }] });
