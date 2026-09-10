import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { activeCustomers, activeSuppliers, financeCategories } from "@/server/queries";
import { PageHeader } from "@/components/ui";
import { FinanceEntryForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewFinanceEntryPage({
  searchParams,
}: { searchParams: Promise<{ tipo?: string }> }) {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "finance.create")) redirect("/financeiro");
  const { tipo } = await searchParams;

  const [customers, suppliers, categories] = await Promise.all([
    activeCustomers(user.companyId),
    activeSuppliers(user.companyId),
    financeCategories(),
  ]);

  return (
    <div>
      <PageHeader title="Novo lançamento" subtitle="Conta a pagar ou a receber" />
      <FinanceEntryForm
        defaultDirection={tipo === "RECEIVABLE" ? "RECEIVABLE" : "PAYABLE"}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        suppliers={suppliers}
        categories={categories.map((c) => ({ id: c.id, name: c.name, direction: c.direction }))}
      />
    </div>
  );
}
