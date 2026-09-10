import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { activeCustomers, pickableProducts, serializedPriceRules } from "@/server/queries";
import { PageHeader } from "@/components/ui";
import { NewOrderForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "orders.create")) redirect("/pedidos");

  const [products, customers, rules] = await Promise.all([
    pickableProducts(user.companyId),
    activeCustomers(user.companyId),
    serializedPriceRules(user.companyId),
  ]);

  return (
    <div>
      <PageHeader title="Novo pedido" subtitle="Reserva o estoque e acompanha até a entrega" />
      <NewOrderForm
        products={products}
        customers={customers.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
        rules={rules}
      />
    </div>
  );
}
