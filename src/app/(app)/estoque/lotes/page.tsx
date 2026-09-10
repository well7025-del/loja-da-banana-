import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { D } from "@/lib/money";
import { date, num, relativeDays } from "@/lib/format";
import { getSettings } from "@/server/services/settings";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterPills, SearchInput } from "@/components/search-input";

export const dynamic = "force-dynamic";

export default async function BatchesPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; filtro?: string }> }) {
  const user = (await getCurrentUser())!;
  const { q, filtro } = await searchParams;
  const settings = await getSettings(user.companyId);
  const alertDays = Number(settings.expiryAlertDays || 30);
  const limit = new Date(Date.now() + alertDays * 86400000);

  const batches = await prisma.batch.findMany({
    where: {
      companyId: user.companyId,
      ...(filtro === "disponiveis" ? { availableQty: { gt: 0 } } : {}),
      ...(filtro === "vencendo" ? { availableQty: { gt: 0 }, expiresAt: { not: null, lte: limit } } : {}),
      ...(filtro === "vencidos" ? { expiresAt: { lt: new Date() } } : {}),
      ...(q
        ? { OR: [{ code: { contains: q, mode: "insensitive" as const } }, { product: { name: { contains: q, mode: "insensitive" as const } } }] }
        : {}),
    },
    include: { product: true, productionOrder: true, supplier: true },
    orderBy: [{ manufacturedAt: "desc" }],
    take: 200,
  });

  return (
    <div>
      <PageHeader title="Lotes" subtitle="Rastreabilidade e controle de validade" />
      <div className="space-y-2">
        <SearchInput placeholder="Buscar por lote ou produto" />
        <FilterPills
          paramName="filtro"
          allLabel="Todos"
          options={[
            { value: "disponiveis", label: "Com saldo" },
            { value: "vencendo", label: `Vencem em ${alertDays}d` },
            { value: "vencidos", label: "Vencidos" },
          ]}
        />
      </div>

      <div className="mt-3">
        {batches.length === 0 ? (
          <EmptyState icon="🏷️" title="Nenhum lote encontrado" detail="Os lotes são gerados automaticamente na produção e na entrada de mercadoria." />
        ) : (
          <Card pad={false}>
            {batches.map((batch) => {
              const expired = batch.expiresAt && batch.expiresAt < new Date();
              const soon = !expired && batch.expiresAt && batch.expiresAt <= limit;
              return (
                <Link key={batch.id} href={`/estoque/lotes/${batch.id}`} className="block active:bg-ink-50">
                  <div className="row">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-ink-900">{batch.product.name}</span>
                        {expired && <Badge tone="red">vencido</Badge>}
                        {soon && <Badge tone="yellow">vence {relativeDays(batch.expiresAt)}</Badge>}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-500">
                        {batch.code} · fabricado em {date(batch.manufacturedAt)}
                        {batch.origin === "PURCHASE" && batch.supplier && ` · ${batch.supplier.name}`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold tabular-nums text-ink-900">
                        {num(D(batch.availableQty), 1)} {batch.product.unit.toLowerCase()}
                      </div>
                      <div className="text-xs text-ink-500">de {num(D(batch.producedQty), 1)}</div>
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
