import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { D } from "@/lib/money";
import { brl, date, datetime, num } from "@/lib/format";
import { MOVEMENT_REASON_LABELS } from "@/lib/defaults";
import { Badge, Card, PageHeader, SectionTitle, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Rastreabilidade completa: origem do lote, insumos usados e para onde foi. */
export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = (await getCurrentUser())!;
  const { id } = await params;

  const batch = await prisma.batch.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      product: true,
      supplier: true,
      warehouse: true,
      productionOrder: {
        include: {
          responsible: { select: { name: true } },
          consumptions: true,
        },
      },
      movements: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!batch) notFound();

  const ingredientIds = batch.productionOrder?.consumptions.map((c) => c.productId) ?? [];
  const ingredients = ingredientIds.length
    ? await prisma.product.findMany({ where: { id: { in: ingredientIds } } })
    : [];
  const nameOf = (productId: string) => ingredients.find((i) => i.id === productId)?.name ?? productId;

  const expired = batch.expiresAt && batch.expiresAt < new Date();

  return (
    <div>
      <PageHeader
        title={`Lote ${batch.code}`}
        subtitle={batch.product.name}
        action={<Link href="/estoque/lotes" className="btn-ghost btn-sm">Voltar</Link>}
      />

      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="Produzido" value={num(D(batch.producedQty), 1)} hint={batch.product.unit.toLowerCase()} />
        <StatCard label="Disponível" value={num(D(batch.availableQty), 1)} hint={batch.product.unit.toLowerCase()} />
        <StatCard label="Custo unitário" value={brl(batch.unitCost)} hint="apurado na origem" />
      </div>

      <SectionTitle>Identificação</SectionTitle>
      <Card pad={false}>
        <div className="row"><span className="text-ink-500">Fabricação</span><span className="font-semibold">{date(batch.manufacturedAt)}</span></div>
        <div className="row">
          <span className="text-ink-500">Validade</span>
          <span className="flex items-center gap-2 font-semibold">
            {date(batch.expiresAt)}
            {expired && <Badge tone="red">vencido</Badge>}
          </span>
        </div>
        <div className="row"><span className="text-ink-500">Origem</span><span className="font-semibold">{batch.origin === "PRODUCTION" ? "Produção própria" : batch.origin === "PURCHASE" ? "Compra" : "Ajuste"}</span></div>
        <div className="row"><span className="text-ink-500">Local</span><span className="font-semibold">{batch.warehouse.name}</span></div>
        {batch.supplier && (
          <div className="row">
            <span className="text-ink-500">Fornecedor</span>
            <Link href={`/fornecedores/${batch.supplier.id}`} className="font-semibold text-leaf-700">{batch.supplier.name}</Link>
          </div>
        )}
        {batch.supplierBatchCode && (
          <div className="row"><span className="text-ink-500">Lote do fornecedor</span><span className="font-semibold">{batch.supplierBatchCode}</span></div>
        )}
        {batch.productionOrder && (
          <>
            <div className="row">
              <span className="text-ink-500">Ordem de produção</span>
              <Link href={`/producao/${batch.productionOrder.id}`} className="font-semibold text-leaf-700">{batch.productionOrder.code}</Link>
            </div>
            <div className="row"><span className="text-ink-500">Responsável</span><span className="font-semibold">{batch.productionOrder.responsible.name}</span></div>
            {batch.productionOrder.actualYieldPct && (
              <div className="row"><span className="text-ink-500">Rendimento</span><span className="font-semibold">{num(D(batch.productionOrder.actualYieldPct), 1)}%</span></div>
            )}
          </>
        )}
      </Card>

      {batch.productionOrder && batch.productionOrder.consumptions.length > 0 && (
        <>
          <SectionTitle>Matéria-prima utilizada</SectionTitle>
          <Card pad={false}>
            {batch.productionOrder.consumptions.map((c) => (
              <div key={c.id} className="row">
                <span className="min-w-0 truncate font-medium text-ink-800">{nameOf(c.productId)}</span>
                <div className="shrink-0 text-right">
                  <div className="font-semibold tabular-nums">{num(D(c.actualQty), 3)}</div>
                  <div className="text-xs text-ink-500">{brl(c.totalCost)}</div>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Movimentações deste lote</SectionTitle>
      {batch.movements.length === 0 ? (
        <Card><p className="text-sm text-ink-500">Nenhuma movimentação registrada.</p></Card>
      ) : (
        <Card pad={false}>
          {batch.movements.map((m) => (
            <div key={m.id} className="row">
              <div className="min-w-0">
                <p className="font-medium text-ink-800">{MOVEMENT_REASON_LABELS[m.reason]}</p>
                <p className="text-xs text-ink-500">
                  {datetime(m.createdAt)}{m.user && ` · ${m.user.name}`}
                </p>
              </div>
              <span className={`shrink-0 font-bold tabular-nums ${m.type === "IN" ? "text-leaf-700" : "text-red-600"}`}>
                {m.type === "IN" ? "+" : "−"}{num(D(m.quantity), 3)}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
