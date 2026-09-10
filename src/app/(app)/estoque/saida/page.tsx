import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { StockExitForm } from "../movement-forms";
import { stockProducts, warehouseOptions } from "../_data";

export const dynamic = "force-dynamic";

export default async function StockExitPage() {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "stock.create")) redirect("/estoque");
  const [products, warehouses] = await Promise.all([
    stockProducts(user.companyId),
    warehouseOptions(user.companyId),
  ]);
  return (
    <div>
      <PageHeader title="Saída de estoque" subtitle="Perdas, transferências e devoluções" />
      <StockExitForm products={products} warehouses={warehouses} />
    </div>
  );
}
