import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { D, ZERO } from "@/lib/money";
import { brl, num } from "@/lib/format";
import { PRODUCT_KIND_LABELS } from "@/lib/defaults";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterPills, SearchInput } from "@/components/search-input";
import { can } from "@/lib/permissions";
import type { ProductKind } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; tipo?: string }> }) {
  const user = (await getCurrentUser())!;
  const { q, tipo } = await searchParams;

  const products = await prisma.product.findMany({
    where: {
      companyId: user.companyId,
      deletedAt: null,
      ...(tipo ? { kind: tipo as ProductKind } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { sku: { contains: q, mode: "insensitive" as const } },
              { barcode: { contains: q } },
            ],
          }
        : {}),
    },
    include: { inventory: true, category: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <PageHeader
        title="Produtos e insumos"
        subtitle={`${products.length} item(ns) cadastrado(s)`}
        action={
          can(user.permissions, "products.create") ? (
            <Link href="/produtos/novo" className="btn-banana btn-sm">+ Novo</Link>
          ) : null
        }
      />

      <div className="space-y-2">
        <SearchInput placeholder="Buscar por nome, código ou código de barras" />
        <FilterPills
          paramName="tipo"
          options={Object.entries(PRODUCT_KIND_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </div>

      <div className="mt-3">
        {products.length === 0 ? (
          <EmptyState
            title="Nenhum produto encontrado"
            detail="Cadastre produtos acabados, matérias-primas e embalagens para começar."
            action={<Link href="/produtos/novo" className="btn-primary btn-sm">Cadastrar produto</Link>}
          />
        ) : (
          <Card pad={false}>
            {products.map((product) => {
              const stock = product.inventory.reduce((a, i) => a.plus(D(i.quantity)), ZERO);
              const low = D(product.minStock).greaterThan(0) && stock.lessThan(D(product.minStock));
              return (
                <Link key={product.id} href={`/produtos/${product.id}`} className="block active:bg-ink-50">
                  <div className="row">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-ink-900">{product.name}</span>
                        {!product.active && <Badge tone="neutral">inativo</Badge>}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-ink-500">
                        {product.sku} · {PRODUCT_KIND_LABELS[product.kind]}
                        {product.category && ` · ${product.category.name}`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`font-semibold tabular-nums ${low ? "text-red-600" : "text-ink-900"}`}>
                        {num(stock, 1)} {product.unit.toLowerCase()}
                      </div>
                      <div className="text-xs text-ink-500">
                        {D(product.salePrice).greaterThan(0)
                          ? brl(product.salePrice)
                          : `custo ${brl(product.avgCost)}`}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
