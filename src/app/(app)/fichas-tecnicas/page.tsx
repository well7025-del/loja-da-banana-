import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeRecipeCost } from "@/server/services/costing";
import { brl, num } from "@/lib/format";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const user = (await getCurrentUser())!;
  const recipes = await prisma.recipe.findMany({
    where: { companyId: user.companyId, deletedAt: null },
    include: { product: true, items: { include: { product: true } } },
    orderBy: { product: { name: "asc" } },
  });

  const withoutRecipe = await prisma.product.findMany({
    where: { companyId: user.companyId, deletedAt: null, kind: "FINISHED", recipe: { is: null } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Fichas técnicas"
        subtitle="Custo real de cada produto fabricado"
        action={
          can(user.permissions, "recipes.create") ? (
            <Link href="/fichas-tecnicas/nova" className="btn-banana btn-sm">+ Nova</Link>
          ) : null
        }
      />

      {recipes.length === 0 ? (
        <EmptyState
          icon="📋" title="Nenhuma ficha técnica"
          detail="A ficha técnica define os insumos, o rendimento e o custo real de cada produto."
          action={<Link href="/fichas-tecnicas/nova" className="btn-primary btn-sm">Criar a primeira</Link>}
        />
      ) : (
        <Card pad={false}>
          {recipes.map((recipe) => {
            const cost = computeRecipeCost(recipe);
            return (
              <Link key={recipe.id} href={`/fichas-tecnicas/${recipe.id}`} className="block active:bg-ink-50">
                <div className="row">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">{recipe.product.name}</p>
                    <p className="text-xs text-ink-500">
                      {recipe.items.length} item(ns) · rende {num(cost.netYield, 1)} {recipe.product.unit.toLowerCase()}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums text-ink-900">{brl(cost.costPerUnit)}</p>
                    <p className="text-xs text-ink-500">por {recipe.product.unit.toLowerCase()}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </Card>
      )}

      {withoutRecipe.length > 0 && (
        <>
          <p className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-ink-500">Sem ficha técnica</p>
          <Card pad={false}>
            {withoutRecipe.map((product) => (
              <Link key={product.id} href={`/fichas-tecnicas/nova?produto=${product.id}`} className="block active:bg-ink-50">
                <div className="row">
                  <span className="font-medium text-ink-800">{product.name}</span>
                  <span className="text-sm font-semibold text-leaf-700">Criar ficha →</span>
                </div>
              </Link>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
