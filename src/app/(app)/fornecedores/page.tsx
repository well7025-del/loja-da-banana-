import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { D, ZERO, money } from "@/lib/money";
import { brl, date } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { SearchInput } from "@/components/search-input";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: { searchParams: Promise<{ q?: string }> }) {
  const user = (await getCurrentUser())!;
  const { q } = await searchParams;

  const suppliers = await prisma.supplier.findMany({
    where: {
      companyId: user.companyId, deletedAt: null,
      ...(q
        ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { taxId: { contains: q } }] }
        : {}),
    },
    include: {
      purchaseOrders: {
        where: { deletedAt: null, status: { not: "CANCELLED" } },
        select: { total: true, orderedAt: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        subtitle={`${suppliers.length} cadastrado(s)`}
        action={can(user.permissions, "suppliers.create") ? (
          <Link href="/fornecedores/novo" className="btn-banana btn-sm">+ Novo</Link>
        ) : null}
      />

      <SearchInput placeholder="Buscar fornecedor" />

      <div className="mt-3">
        {suppliers.length === 0 ? (
          <EmptyState icon="🚚" title="Nenhum fornecedor cadastrado"
            action={<Link href="/fornecedores/novo" className="btn-primary btn-sm">Cadastrar fornecedor</Link>} />
        ) : (
          <Card pad={false}>
            {suppliers.map((supplier) => {
              const total = supplier.purchaseOrders.reduce((a, p) => a.plus(D(p.total)), ZERO);
              const last = supplier.purchaseOrders.reduce<Date | null>(
                (acc, p) => (!acc || p.orderedAt > acc ? p.orderedAt : acc), null,
              );
              return (
                <Link key={supplier.id} href={`/fornecedores/${supplier.id}`} className="block active:bg-ink-50">
                  <div className="row">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-ink-900">{supplier.name}</span>
                        {!supplier.active && <Badge>inativo</Badge>}
                      </div>
                      <p className="truncate text-xs text-ink-500">
                        {supplier.suppliedItems ?? supplier.city ?? "—"}
                        {last && ` · última compra ${date(last)}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums">{brl(money(total))}</p>
                      <p className="text-xs text-ink-500">{supplier.purchaseOrders.length} compra(s)</p>
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
