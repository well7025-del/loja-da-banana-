import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { CustomerForm } from "../form";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "customers.create")) redirect("/clientes");
  return (
    <div>
      <PageHeader title="Novo cliente" />
      <CustomerForm canDelete={false} />
    </div>
  );
}
