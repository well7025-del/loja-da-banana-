import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { activeSuppliers } from "@/server/queries";
import { PageHeader } from "@/components/ui";
import { StockEntryForm } from "../movement-forms";
import { stockProducts } from "../_data";

export const dynamic = "force-dynamic";

export default async function StockEntryPage() {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "stock.create")) redirect("/estoque");
  const [products, suppliers] = await Promise.all([
    stockProducts(user.companyId),
    activeSuppliers(user.companyId),
  ]);
  return (
    <div>
      <PageHeader title="Entrada de estoque" subtitle="Recebimento, devolução ou saldo inicial" />
      <StockEntryForm products={products} suppliers={suppliers} />
    </div>
  );
}
