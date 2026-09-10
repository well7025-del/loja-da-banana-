import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { activeSuppliers } from "@/server/queries";
import { D, ZERO } from "@/lib/money";
import { brl, num } from "@/lib/format";
import { Card, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { can } from "@/lib/permissions";
import { ProductForm } from "../form";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const user = (await getCurrentUser())!;
  const { id } = await params;
  const { ok } = await searchParams;

  const product = await prisma.product.findFirst({
    where: { id, companyId: user.companyId },
    include: { inventory: true, category: true, rawMaterial: true, recipe: true },
  });
  if (!product) notFound();

  const [suppliers, categories] = await Promise.all([
    activeSuppliers(user.companyId),
    prisma.category.findMany({ where: { companyId: user.companyId }, select: { name: true } }),
  ]);

  const stock = product.inventory.reduce((a, i) => a.plus(D(i.quantity)), ZERO);
  const margin = D(product.salePrice).greaterThan(0)
    ? D(product.salePrice).minus(D(product.avgCost)).dividedBy(D(product.salePrice)).times(100)
    : ZERO;

  return (
    <div>
      <PageHeader
        title={product.name}
        subtitle={`${product.sku}${product.barcode ? ` · ${product.barcode}` : ""}`}
      />

      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="Em estoque" value={`${num(stock, 1)}`} hint={product.unit.toLowerCase()} />
        <StatCard label="Custo médio" value={brl(product.avgCost)} hint="por unidade" />
        <StatCard label="Margem atual" value={`${num(margin, 1)}%`} tone={margin.lessThan(10) ? "red" : "green"} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/estoque/${product.id}`} className="btn-ghost btn-sm">Ver movimentos</Link>
        <Link href={`/precificacao?produto=${product.id}`} className="btn-ghost btn-sm">Formar preço</Link>
        {product.kind === "FINISHED" && (
          <Link
            href={product.recipe ? `/fichas-tecnicas/${product.recipe.id}` : `/fichas-tecnicas/nova?produto=${product.id}`}
            className="btn-ghost btn-sm"
          >
            {product.recipe ? "Ficha técnica" : "Criar ficha técnica"}
          </Link>
        )}
      </div>

      <SectionTitle>Cadastro</SectionTitle>
      {can(user.permissions, "products.update") ? (
        <ProductForm
          product={{
            id: product.id,
            sku: product.sku,
            name: product.name,
            kind: product.kind,
            barcode: product.barcode,
            description: product.description,
            categoryName: product.category?.name ?? null,
            unit: product.unit,
            netWeightKg: product.netWeightKg?.toString() ?? null,
            salePrice: D(product.salePrice).toFixed(2),
            wholesalePrice: D(product.wholesalePrice).toFixed(2),
            targetMargin: D(product.targetMargin).toFixed(2),
            minStock: D(product.minStock).toString(),
            maxStock: product.maxStock?.toString() ?? null,
            shelfLifeDays: product.shelfLifeDays?.toString() ?? null,
            trackBatches: product.trackBatches,
            active: product.active,
            rawMaterial: product.rawMaterial
              ? {
                  purchaseUnit: product.rawMaterial.purchaseUnit,
                  purchaseFactor: D(product.rawMaterial.purchaseFactor).toString(),
                  standardLossPct: D(product.rawMaterial.standardLossPct).toString(),
                  leadTimeDays: String(product.rawMaterial.leadTimeDays),
                  preferredSupplierId: product.rawMaterial.preferredSupplierId,
                }
              : null,
          }}
          suppliers={suppliers}
          categories={[...new Set(categories.map((c) => c.name))]}
          canDelete={can(user.permissions, "products.delete")}
          saved={ok === "1"}
        />
      ) : (
        <Card><p className="text-sm text-ink-500">Você não tem permissão para editar este cadastro.</p></Card>
      )}
    </div>
  );
}
