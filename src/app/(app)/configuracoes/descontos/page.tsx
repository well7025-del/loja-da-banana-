import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { D } from "@/lib/money";
import { PageHeader, SectionTitle } from "@/components/ui";
import { PriceRulesManager } from "./manager";

export const dynamic = "force-dynamic";

export default async function PriceRulesPage() {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "pricing.read")) redirect("/");

  const [rules, products] = await Promise.all([
    prisma.priceRule.findMany({
      where: { companyId: user.companyId },
      include: { product: { select: { name: true } } },
      orderBy: [{ type: "asc" }, { minQty: "asc" }, { minValue: "asc" }],
    }),
    prisma.product.findMany({
      where: { companyId: user.companyId, deletedAt: null, kind: { in: ["FINISHED", "RESALE"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Política de descontos"
        subtitle="As faixas do atacado são configuráveis — nada fica fixo no sistema"
      />
      <SectionTitle>Regras cadastradas</SectionTitle>
      <PriceRulesManager
        rules={rules.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          minQty: D(r.minQty).toString(),
          minValue: D(r.minValue).toFixed(2),
          discountPct: D(r.discountPct).toString(),
          channel: r.channel,
          customerType: r.customerType,
          productId: r.productId,
          productName: r.product?.name ?? null,
          priority: r.priority,
          active: r.active,
        }))}
        products={products}
        canEdit={can(user.permissions, "pricing.update")}
        canDelete={can(user.permissions, "pricing.delete")}
      />
    </div>
  );
}
