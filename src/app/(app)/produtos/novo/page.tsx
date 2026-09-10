import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { activeSuppliers } from "@/server/queries";
import { PageHeader } from "@/components/ui";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ProductForm } from "../form";

export const dynamic = "force-dynamic";

export default async function NewProductPage({
  searchParams,
}: { searchParams: Promise<{ tipo?: string }> }) {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "products.create")) redirect("/produtos");
  const { tipo } = await searchParams;

  const [suppliers, categories] = await Promise.all([
    activeSuppliers(user.companyId),
    prisma.category.findMany({ where: { companyId: user.companyId }, select: { name: true } }),
  ]);

  return (
    <div>
      <PageHeader title="Novo produto" subtitle="Produto acabado, matéria-prima ou embalagem" />
      <ProductForm
        product={{ kind: tipo ?? "FINISHED" }}
        suppliers={suppliers}
        categories={[...new Set(categories.map((c) => c.name))]}
        canDelete={false}
      />
    </div>
  );
}
