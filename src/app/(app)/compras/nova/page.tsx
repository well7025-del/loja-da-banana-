import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { activeSuppliers, pickableProducts } from "@/server/queries";
import { PageHeader } from "@/components/ui";
import { NewPurchaseForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewPurchasePage() {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "purchases.create")) redirect("/compras");

  const [products, suppliers] = await Promise.all([
    pickableProducts(user.companyId, ["RAW", "PACKAGING", "RESALE", "FINISHED"]),
    activeSuppliers(user.companyId),
  ]);

  return (
    <div>
      <PageHeader title="Nova compra" subtitle="O custo médio é recalculado no recebimento" />
      <NewPurchaseForm products={products} suppliers={suppliers} />
    </div>
  );
}
