import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { StockAdjustForm } from "../movement-forms";
import { stockProducts } from "../_data";

export const dynamic = "force-dynamic";

export default async function StockAdjustPage() {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "stock.update")) redirect("/estoque");
  const products = await stockProducts(user.companyId);
  return (
    <div>
      <PageHeader title="Ajuste de inventário" subtitle="Informe a quantidade contada — o sistema registra a diferença" />
      <StockAdjustForm products={products} />
    </div>
  );
}
