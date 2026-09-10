import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { RecipeForm } from "../recipe-form";
import { recipeFormData } from "../_data";

export const dynamic = "force-dynamic";

export default async function NewRecipePage({
  searchParams,
}: { searchParams: Promise<{ produto?: string }> }) {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "recipes.create")) redirect("/fichas-tecnicas");
  const { produto } = await searchParams;
  const { products, ingredients } = await recipeFormData(user.companyId);

  const ordered = produto ? [...products].sort((a) => (a.id === produto ? -1 : 1)) : products;

  return (
    <div>
      <PageHeader title="Nova ficha técnica" subtitle="Informe os insumos e o rendimento esperado" />
      <RecipeForm products={ordered} ingredients={ingredients} />
    </div>
  );
}
