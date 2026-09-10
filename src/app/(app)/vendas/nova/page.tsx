import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { activeCustomers, pickableProducts, serializedPriceRules } from "@/server/queries";
import { PageHeader } from "@/components/ui";
import { NewSaleForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewSalePage() {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "sales.create")) redirect("/vendas");

  const [products, customers, rules] = await Promise.all([
    pickableProducts(user.companyId),
    activeCustomers(user.companyId),
    serializedPriceRules(user.companyId),
  ]);

  return (
    <div>
      <PageHeader title="Nova venda" subtitle="Descontos de atacado aplicados automaticamente" />
      <NewSaleForm
        products={products}
        customers={customers.map((c) => ({ id: c.id, name: c.name, type: c.type, creditLimit: c.creditLimit.toString() }))}
        rules={rules}
      />
    </div>
  );
}
