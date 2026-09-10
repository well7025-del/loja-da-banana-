import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { stockLevels } from "@/server/services/inventory";
import { D, ZERO } from "@/lib/money";
import { brl, num } from "@/lib/format";
import { PRODUCT_KIND_LABELS } from "@/lib/defaults";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { FilterPills, SearchInput } from "@/components/search-input";
import { can } from "@/lib/permissions";
import type { ProductKind } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function StockPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; tipo?: string; filtro?: string }> }) {
  const user = (await getCurrentUser())!;
  const { q, tipo, filtro } = await searchParams;

  let rows = await stockLevels(user.companyId, tipo ? [tipo as ProductKind] : undefined);
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => r.product.name.toLowerCase().includes(needle) || r.product.sku.toLowerCase().includes(needle));
  }
  if (filtro === "critico") rows = rows.filter((r) => r.belowMin);
  if (filtro === "zerado") rows = rows.filter((r) => r.quantity.lessThanOrEqualTo(0));

  const totalValue = rows.reduce((a, r) => a.plus(D(r.value)), ZERO);
  const criticalCount = rows.filter((r) => r.belowMin).length;

  return (
    <div>
      <PageHeader title="Estoque" subtitle={`${rows.length} item(ns)`} />

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Valor em estoque" value={brl(totalValue)} hint="pelo custo médio" />
        <StatCard
          label="Itens críticos" value={criticalCount}
          hint="abaixo do mínimo" tone={criticalCount > 0 ? "red" : "green"}
        />
      </div>

      {can(user.permissions, "stock.create") && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Link href="/estoque/entrada" className="btn-primary btn-sm">⬇️ Entrada</Link>
          <Link href="/estoque/saida" className="btn-ghost btn-sm">⬆️ Saída</Link>
          <Link href="/estoque/ajuste" className="btn-ghost btn-sm">⚖️ Ajuste</Link>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Link href="/estoque/lotes" className="font-semibold text-leaf-700">Lotes e validades →</Link>
        <Link href="/estoque/movimentos" className="font-semibold text-leaf-700">Movimentações →</Link>
      </div>

      <div className="mt-3 space-y-2">
        <SearchInput placeholder="Buscar item no estoque" />
        <FilterPills
          paramName="tipo"
          options={Object.entries(PRODUCT_KIND_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <FilterPills
          paramName="filtro"
          allLabel="Situação: todas"
          options={[{ value: "critico", label: "Abaixo do mínimo" }, { value: "zerado", label: "Zerados" }]}
        />
      </div>

      <div className="mt-3">
        {rows.length === 0 ? (
          <EmptyState icon="📦" title="Nenhum item encontrado" detail="Ajuste os filtros ou registre uma entrada de estoque." />
        ) : (
          <Card pad={false}>
            {rows.map((row) => (
              <Link key={row.product.id} href={`/estoque/${row.product.id}`} className="block active:bg-ink-50">
                <div className="row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-ink-900">{row.product.name}</span>
                      {row.belowMin && <Badge tone="red">baixo</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-500">
                      Mín. {num(row.product.minStock, 1)}
                      {row.reserved.greaterThan(0) && ` · ${num(row.reserved, 1)} reservado`}
                      {" · "}{brl(row.value)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`text-base font-bold tabular-nums ${row.belowMin ? "text-red-600" : "text-ink-900"}`}>
                      {num(row.quantity, 1)}
                    </div>
                    <div className="text-xs text-ink-500">{row.product.unit.toLowerCase()} disponível {num(row.available, 1)}</div>
                  </div>
                </div>
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
