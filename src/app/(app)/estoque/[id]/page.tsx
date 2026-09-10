import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { D, ZERO } from "@/lib/money";
import { brl, datetime, num } from "@/lib/format";
import { MOVEMENT_REASON_LABELS } from "@/lib/defaults";
import { Card, EmptyState, PageHeader, SectionTitle, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Ficha de estoque (kardex) do item. */
export default async function ProductStockPage({ params }: { params: Promise<{ id: string }> }) {
  const user = (await getCurrentUser())!;
  const { id } = await params;

  const product = await prisma.product.findFirst({
    where: { id, companyId: user.companyId },
    include: { inventory: { include: { warehouse: true } } },
  });
  if (!product) notFound();

  const [movements, batches] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: { productId: id, companyId: user.companyId },
      include: { user: { select: { name: true } }, batch: { select: { code: true, id: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.batch.findMany({
      where: { productId: id, companyId: user.companyId, availableQty: { gt: 0 } },
      orderBy: [{ expiresAt: "asc" }],
    }),
  ]);

  const stock = product.inventory.reduce((a, i) => a.plus(D(i.quantity)), ZERO);
  const reserved = product.inventory.reduce((a, i) => a.plus(D(i.reserved)), ZERO);

  return (
    <div>
      <PageHeader
        title={product.name}
        subtitle={`${product.sku} · ficha de estoque`}
        action={<Link href={`/produtos/${product.id}`} className="btn-ghost btn-sm">Cadastro</Link>}
      />

      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="Saldo" value={num(stock, 1)} hint={product.unit.toLowerCase()} />
        <StatCard label="Reservado" value={num(reserved, 1)} hint="em pedidos" />
        <StatCard label="Disponível" value={num(stock.minus(reserved), 1)} tone="green" />
      </div>

      {product.inventory.length > 1 && (
        <>
          <SectionTitle>Por local</SectionTitle>
          <Card pad={false}>
            {product.inventory.map((row) => (
              <div key={row.id} className="row">
                <span className="font-medium text-ink-800">{row.warehouse.name}</span>
                <span className="font-semibold tabular-nums">{num(D(row.quantity), 3)} {product.unit.toLowerCase()}</span>
              </div>
            ))}
          </Card>
        </>
      )}

      {batches.length > 0 && (
        <>
          <SectionTitle>Lotes com saldo (ordem de saída)</SectionTitle>
          <Card pad={false}>
            {batches.map((batch) => (
              <Link key={batch.id} href={`/estoque/lotes/${batch.id}`} className="block active:bg-ink-50">
                <div className="row">
                  <div>
                    <p className="font-medium text-ink-800">{batch.code}</p>
                    <p className="text-xs text-ink-500">
                      {batch.expiresAt ? `Vence em ${batch.expiresAt.toLocaleDateString("pt-BR")}` : "Sem validade"}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{num(D(batch.availableQty), 3)}</span>
                </div>
              </Link>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Movimentações</SectionTitle>
      {movements.length === 0 ? (
        <EmptyState icon="📄" title="Sem movimentações" detail="As entradas e saídas aparecem aqui automaticamente." />
      ) : (
        <Card pad={false}>
          {movements.map((m) => (
            <div key={m.id} className="row">
              <div className="min-w-0">
                <p className="font-medium text-ink-800">{MOVEMENT_REASON_LABELS[m.reason]}</p>
                <p className="truncate text-xs text-ink-500">
                  {datetime(m.createdAt)}
                  {m.batch && ` · ${m.batch.code}`}
                  {m.user && ` · ${m.user.name}`}
                </p>
                {m.note && <p className="truncate text-xs text-ink-400">{m.note}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className={`font-bold tabular-nums ${m.type === "IN" ? "text-leaf-700" : m.type === "OUT" ? "text-red-600" : "text-ink-700"}`}>
                  {m.type === "IN" ? "+" : m.type === "OUT" ? "−" : "±"}{num(D(m.quantity), 3)}
                </p>
                <p className="text-xs text-ink-500">saldo {num(D(m.balanceAfter), 1)} · {brl(m.unitCost)}</p>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
