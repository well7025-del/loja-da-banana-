import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { D, ZERO } from "@/lib/money";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { NewProductionForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewProductionPage({
  searchParams,
}: { searchParams: Promise<{ produto?: string; qtd?: string }> }) {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "production.create")) redirect("/producao");
  const { produto, qtd } = await searchParams;

  const products = await prisma.product.findMany({
    where: { companyId: user.companyId, deletedAt: null, active: true, kind: "FINISHED" },
    include: { recipe: { select: { id: true } }, inventory: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader title="Nova produção" subtitle="A matéria-prima é calculada pela ficha técnica" />
      <NewProductionForm
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          unit: p.unit,
          hasRecipe: Boolean(p.recipe),
          stock: p.inventory.reduce((a, i) => a.plus(D(i.quantity)), ZERO).toNumber(),
          minStock: D(p.minStock).toNumber(),
        }))}
        defaultProductId={produto ?? ""}
        defaultQty={qtd ?? ""}
      />
    </div>
  );
}
