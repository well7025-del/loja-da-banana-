import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { D } from "@/lib/money";
import { brl, datetime, num } from "@/lib/format";
import { PRODUCTION_STATUS_LABELS } from "@/lib/defaults";
import { Badge, Card, FormMessage, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { can } from "@/lib/permissions";
import { FinishProductionForm, ProductionActions } from "./forms";

export const dynamic = "force-dynamic";

export default async function ProductionOrderPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lote?: string; custo?: string }>;
}) {
  const user = (await getCurrentUser())!;
  const { id } = await params;
  const { lote, custo } = await searchParams;

  const order = await prisma.productionOrder.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      product: true,
      recipe: true,
      responsible: { select: { name: true } },
      consumptions: true,
      batches: true,
    },
  });
  if (!order) notFound();

  const ingredients = await prisma.product.findMany({
    where: { id: { in: order.consumptions.map((c) => c.productId) } },
    include: { inventory: true },
  });
  const info = (productId: string) => ingredients.find((i) => i.id === productId);

  const finished = order.status === "FINISHED";
  const canFinish = can(user.permissions, "production.update") && (order.status === "PLANNED" || order.status === "IN_PROGRESS");

  return (
    <div>
      {lote && (
        <div className="mb-3">
          <FormMessage
            success={`Produção finalizada. Lote ${lote} gerado${custo ? ` com custo de R$ ${custo} por ${order.product.unit.toLowerCase()}` : ""}.`}
          />
        </div>
      )}

      <PageHeader
        title={order.product.name}
        subtitle={`Ordem ${order.code}`}
        action={<Badge tone={finished ? "green" : order.status === "CANCELLED" ? "neutral" : "yellow"}>
          {PRODUCTION_STATUS_LABELS[order.status]}
        </Badge>}
      />

      <div className="grid grid-cols-3 gap-2.5">
        <StatCard
          label={finished ? "Produzido" : "Planejado"}
          value={num(D(order.producedQty ?? order.plannedQty), 1)}
          hint={order.product.unit.toLowerCase()}
        />
        <StatCard label="Custo real" value={brl(order.totalCost)} hint={finished ? `${brl(order.unitCost)}/${order.product.unit.toLowerCase()}` : "após finalizar"} />
        <StatCard
          label="Rendimento"
          value={order.actualYieldPct ? `${num(D(order.actualYieldPct), 1)}%` : "—"}
          hint={order.expectedYieldPct ? `previsto ${num(D(order.expectedYieldPct), 1)}%` : undefined}
          tone={
            order.actualYieldPct && order.expectedYieldPct
              ? D(order.actualYieldPct).lessThan(D(order.expectedYieldPct).times(0.9)) ? "red" : "green"
              : "neutral"
          }
        />
      </div>

      {canFinish && (
        <>
          <SectionTitle>Finalizar produção</SectionTitle>
          <FinishProductionForm
            orderId={order.id}
            unit={order.product.unit}
            plannedQty={D(order.plannedQty).toString()}
            consumptions={order.consumptions.map((c) => ({
              productId: c.productId,
              name: info(c.productId)?.name ?? c.productId,
              unit: info(c.productId)?.unit ?? "",
              plannedQty: D(c.plannedQty).toString(),
            }))}
          />
        </>
      )}

      <SectionTitle>Matéria-prima {finished ? "consumida" : "prevista"}</SectionTitle>
      <Card pad={false}>
        {order.consumptions.length === 0 && (
          <p className="px-4 py-4 text-sm text-ink-500">
            Esta ordem não tem ficha técnica associada, portanto não há baixa automática de insumos.
          </p>
        )}
        {order.consumptions.map((c) => (
          <div key={c.id} className="row">
            <div className="min-w-0">
              <p className="truncate font-medium text-ink-800">{info(c.productId)?.name}</p>
              <p className="text-xs text-ink-500">
                Previsto {num(D(c.plannedQty), 3)} {info(c.productId)?.unit.toLowerCase()}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold tabular-nums">{num(D(finished ? c.actualQty : c.plannedQty), 3)}</p>
              <p className="text-xs text-ink-500">{brl(c.totalCost)}</p>
            </div>
          </div>
        ))}
      </Card>

      {order.batches.length > 0 && (
        <>
          <SectionTitle>Lote gerado</SectionTitle>
          <Card pad={false}>
            {order.batches.map((batch) => (
              <Link key={batch.id} href={`/estoque/lotes/${batch.id}`} className="block active:bg-ink-50">
                <div className="row">
                  <div>
                    <p className="font-semibold text-ink-900">{batch.code}</p>
                    <p className="text-xs text-ink-500">
                      Validade {batch.expiresAt ? batch.expiresAt.toLocaleDateString("pt-BR") : "não informada"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{num(D(batch.availableQty), 1)} disponível</p>
                    <p className="text-xs text-ink-500">de {num(D(batch.producedQty), 1)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Detalhes</SectionTitle>
      <Card pad={false}>
        <div className="row"><span className="text-ink-500">Responsável</span><span className="font-semibold">{order.responsible.name}</span></div>
        <div className="row"><span className="text-ink-500">Criada em</span><span className="font-semibold">{datetime(order.createdAt)}</span></div>
        {order.startedAt && <div className="row"><span className="text-ink-500">Iniciada em</span><span className="font-semibold">{datetime(order.startedAt)}</span></div>}
        {order.finishedAt && <div className="row"><span className="text-ink-500">Finalizada em</span><span className="font-semibold">{datetime(order.finishedAt)}</span></div>}
        {D(order.lossQty).greaterThan(0) && (
          <div className="row"><span className="text-ink-500">Perdas</span><span className="font-semibold text-red-600">{num(D(order.lossQty), 3)} {order.product.unit.toLowerCase()}</span></div>
        )}
        {order.notes && <div className="row"><span className="text-ink-500">Observações</span><span className="max-w-[60%] text-right font-medium">{order.notes}</span></div>}
      </Card>

      <div className="mt-4">
        <ProductionActions
          orderId={order.id}
          status={order.status}
          canStart={can(user.permissions, "production.update")}
          canCancel={can(user.permissions, "production.delete")}
        />
      </div>
    </div>
  );
}
