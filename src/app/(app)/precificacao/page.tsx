import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { D } from "@/lib/money";
import { getSettings } from "@/server/services/settings";
import { computeRecipeCost } from "@/server/services/costing";
import { PageHeader } from "@/components/ui";
import { PricingCalculator } from "./calculator";

export const dynamic = "force-dynamic";

export default async function PricingPage({
  searchParams,
}: { searchParams: Promise<{ produto?: string }> }) {
  const user = (await getCurrentUser())!;
  const { produto } = await searchParams;
  const settings = await getSettings(user.companyId);

  const products = await prisma.product.findMany({
    where: { companyId: user.companyId, deletedAt: null, kind: { in: ["FINISHED", "RESALE"] } },
    include: { recipe: { include: { items: { include: { product: true } }, product: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Formação de preço"
        subtitle="Custo, encargos e margem para chegar ao preço justo"
      />
      <PricingCalculator
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          unit: p.unit,
          avgCost: D(p.avgCost).toNumber(),
          recipeCost: p.recipe ? computeRecipeCost(p.recipe).costPerUnit.toNumber() : null,
          salePrice: D(p.salePrice).toNumber(),
          targetMargin: D(p.targetMargin).toNumber(),
        }))}
        defaults={{
          taxPct: Number(settings.taxPct),
          fixedOverheadPct: Number(settings.fixedOverheadPct),
          commissionPct: Number(settings.commissionPct),
          cardFeePct: Number(settings.cardFeePct),
          targetMarginPct: Number(settings.defaultTargetMarginPct),
        }}
        initialProductId={produto ?? ""}
      />
    </div>
  );
}
