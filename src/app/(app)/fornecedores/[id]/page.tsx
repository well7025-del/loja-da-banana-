import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { D, ZERO, money } from "@/lib/money";
import { brl, date, num } from "@/lib/format";
import { PURCHASE_STATUS_LABELS } from "@/lib/defaults";
import { Card, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { can } from "@/lib/permissions";
import { SupplierForm } from "../form";

export const dynamic = "force-dynamic";

export default async function SupplierPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; editar?: string }> }) {
  const user = (await getCurrentUser())!;
  const { id } = await params;
  const { ok, editar } = await searchParams;

  const supplier = await prisma.supplier.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      purchaseOrders: {
        where: { deletedAt: null },
        include: { items: { include: { product: true } } },
        orderBy: { orderedAt: "desc" },
        take: 20,
      },
      financeEntries: {
        where: { direction: "PAYABLE", status: { in: ["OPEN", "PARTIAL"] }, deletedAt: null },
      },
    },
  });
  if (!supplier) notFound();

  if (editar === "1" && can(user.permissions, "suppliers.update")) {
    return (
      <div>
        <PageHeader title="Editar fornecedor" subtitle={supplier.name} />
        <SupplierForm
          supplier={{
            id: supplier.id, name: supplier.name, legalName: supplier.legalName, taxId: supplier.taxId,
            phone: supplier.phone, whatsapp: supplier.whatsapp, contactName: supplier.contactName,
            email: supplier.email, city: supplier.city, state: supplier.state, address: supplier.address,
            suppliedItems: supplier.suppliedItems, avgLeadTimeDays: String(supplier.avgLeadTimeDays),
            paymentTerms: supplier.paymentTerms, notes: supplier.notes, active: supplier.active,
          }}
          canDelete={can(user.permissions, "suppliers.delete")}
          saved={ok === "1"}
        />
      </div>
    );
  }

  const total = supplier.purchaseOrders
    .filter((p) => p.status !== "CANCELLED")
    .reduce((a, p) => a.plus(D(p.total)), ZERO);
  const open = supplier.financeEntries.reduce((a, e) => a.plus(D(e.amount).minus(D(e.paidAmount))), ZERO);

  // Histórico de preço por item
  const priceHistory = new Map<string, { name: string; unit: string; prices: { price: string; at: Date }[] }>();
  for (const purchase of supplier.purchaseOrders) {
    for (const item of purchase.items) {
      const entry = priceHistory.get(item.productId) ?? { name: item.product.name, unit: item.product.unit, prices: [] };
      entry.prices.push({ price: D(item.unitPrice).toFixed(2), at: purchase.orderedAt });
      priceHistory.set(item.productId, entry);
    }
  }

  return (
    <div>
      <PageHeader
        title={supplier.name}
        subtitle={supplier.city ? `${supplier.city}${supplier.state ? `/${supplier.state}` : ""}` : undefined}
        action={can(user.permissions, "suppliers.update") ? (
          <Link href={`/fornecedores/${supplier.id}?editar=1`} className="btn-ghost btn-sm">Editar</Link>
        ) : null}
      />

      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="Total comprado" value={brl(money(total))} hint={`${supplier.purchaseOrders.length} compra(s)`} />
        <StatCard label="A pagar" value={brl(money(open))} tone={open.greaterThan(0) ? "red" : "green"} />
        <StatCard label="Prazo médio" value={`${supplier.avgLeadTimeDays}d`} hint="entrega" />
      </div>

      {(supplier.whatsapp || supplier.phone) && (
        <div className="mt-3 flex gap-2">
          {supplier.whatsapp && (
            <a href={`https://wa.me/55${supplier.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm flex-1">
              💬 WhatsApp
            </a>
          )}
          {can(user.permissions, "purchases.create") && (
            <Link href="/compras/nova" className="btn-banana btn-sm flex-1">🛒 Nova compra</Link>
          )}
        </div>
      )}

      {priceHistory.size > 0 && (
        <>
          <SectionTitle>Histórico de preços</SectionTitle>
          <Card pad={false}>
            {[...priceHistory.entries()].map(([productId, entry]) => {
              const latest = entry.prices[0];
              const previous = entry.prices[1];
              const variation = previous
                ? ((Number(latest.price) - Number(previous.price)) / Number(previous.price)) * 100
                : null;
              return (
                <div key={productId} className="row">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-800">{entry.name}</p>
                    <p className="text-xs text-ink-500">
                      {entry.prices.length} compra(s) · última em {date(latest.at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">R$ {latest.price}/{entry.unit.toLowerCase()}</p>
                    {variation !== null && Math.abs(variation) >= 0.5 && (
                      <p className={`text-xs font-semibold ${variation > 0 ? "text-red-600" : "text-leaf-700"}`}>
                        {variation > 0 ? "▲" : "▼"} {num(Math.abs(variation), 1)}%
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        </>
      )}

      <SectionTitle>Compras</SectionTitle>
      {supplier.purchaseOrders.length === 0 ? (
        <Card><p className="text-sm text-ink-500">Nenhuma compra registrada com este fornecedor.</p></Card>
      ) : (
        <Card pad={false}>
          {supplier.purchaseOrders.map((purchase) => (
            <Link key={purchase.id} href={`/compras/${purchase.id}`} className="block active:bg-ink-50">
              <div className="row">
                <div>
                  <p className="font-medium text-ink-800">{purchase.number}</p>
                  <p className="text-xs text-ink-500">{date(purchase.orderedAt)} · {PURCHASE_STATUS_LABELS[purchase.status]}</p>
                </div>
                <span className="font-semibold tabular-nums">{brl(purchase.total)}</span>
              </div>
            </Link>
          ))}
        </Card>
      )}

      <SectionTitle>Dados cadastrais</SectionTitle>
      <Card pad={false}>
        {supplier.taxId && <div className="row"><span className="text-ink-500">CNPJ/CPF</span><span className="font-semibold">{supplier.taxId}</span></div>}
        {supplier.contactName && <div className="row"><span className="text-ink-500">Contato</span><span className="font-semibold">{supplier.contactName}</span></div>}
        {supplier.phone && <div className="row"><span className="text-ink-500">Telefone</span><span className="font-semibold">{supplier.phone}</span></div>}
        {supplier.email && <div className="row"><span className="text-ink-500">E-mail</span><span className="font-semibold">{supplier.email}</span></div>}
        {supplier.suppliedItems && <div className="row"><span className="text-ink-500">Fornece</span><span className="max-w-[60%] text-right">{supplier.suppliedItems}</span></div>}
        {supplier.paymentTerms && <div className="row"><span className="text-ink-500">Condição</span><span className="font-semibold">{supplier.paymentTerms}</span></div>}
      </Card>
    </div>
  );
}
