import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { SupplierForm } from "../form";

export const dynamic = "force-dynamic";

export default async function NewSupplierPage() {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "suppliers.create")) redirect("/fornecedores");
  return (
    <div>
      <PageHeader title="Novo fornecedor" />
      <SupplierForm canDelete={false} />
    </div>
  );
}
