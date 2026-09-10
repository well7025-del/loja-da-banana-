import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Card, PageHeader } from "@/components/ui";
import { StockTransferForm } from "../movement-forms";
import { stockProducts, warehouseOptions } from "../_data";

export const dynamic = "force-dynamic";

export default async function StockTransferPage() {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "stock.create")) redirect("/estoque");

  const [products, warehouses] = await Promise.all([
    stockProducts(user.companyId),
    warehouseOptions(user.companyId),
  ]);

  if (warehouses.length < 2) {
    return (
      <div>
        <PageHeader title="Transferência entre locais" />
        <Card>
          <p className="text-sm text-ink-600">
            A empresa tem apenas um local de estoque cadastrado. Cadastre outro local
            (loja, centro de distribuição) para movimentar mercadoria entre eles.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Transferência entre locais"
        subtitle="A rastreabilidade do lote é mantida no destino"
      />
      <StockTransferForm products={products} warehouses={warehouses} />
    </div>
  );
}
