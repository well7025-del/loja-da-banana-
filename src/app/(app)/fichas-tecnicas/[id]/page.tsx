import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRecipeCost, computePriceWithDefaults } from "@/server/services/costing";
import { D } from "@/lib/money";
import { brl, num } from "@/lib/format";
import { getSettings } from "@/server/services/settings";
import { Card, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { can } from "@/lib/permissions";
import { RecipeForm } from "../recipe-form";
import { recipeFormData } from "../_data";
import { ApplyCostButton } from "./apply-cost";

export const dynamic = "force-dynamic";

export default async function RecipePage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; editar?: string }> }) {
  const user = (await getCurrentUser())!;
  const { id } = await params;
  const { editar } = await searchParams;

  const result = await getRecipeCost(id);
  if (!result || result.recipe.companyId !== user.companyId) notFound();
  const { recipe, cost } = result;

  const settings = await getSettings(user.companyId);
  const pricing = await computePriceWithDefaults(user.companyId, {
    unitCost: cost.costPerUnit,
    targetMarginPct: D(recipe.product.targetMargin).greaterThan(0)
      ? D(recipe.product.targetMargin)
      : settings.defaultTargetMarginPct,
    currentPrice: D(recipe.product.salePrice),
  });

  if (editar === "1" && can(user.permissions, "recipes.update")) {
    const { products, ingredients } = await recipeFormData(user.companyId);
    return (
      <div>
        <PageHeader title="Editar ficha técnica" subtitle={recipe.product.name} />
        <RecipeForm
          products={products}
          ingredients={ingredients}
          recipe={{
            id: recipe.id,
            productId: recipe.productId,
            name: recipe.name,
            yieldQty: D(recipe.yieldQty).toString(),
            expectedLossPct: D(recipe.expectedLossPct).toString(),
            laborCost: D(recipe.laborCost).toFixed(2),
            energyCost: D(recipe.energyCost).toFixed(2),
            otherCost: D(recipe.otherCost).toFixed(2),
            notes: recipe.notes,
            items: recipe.items.map((i) => ({
              productId: i.productId,
              quantity: D(i.quantity).toString(),
              unit: i.unit,
              lossPct: D(i.lossPct).toString(),
              isMain: i.isMain,
              note: i.note ?? "",
            })),
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={recipe.product.name}
        subtitle={recipe.name}
        action={
          can(user.permissions, "recipes.update") ? (
            <Link href={`/fichas-tecnicas/${recipe.id}?editar=1`} className="btn-ghost btn-sm">Editar</Link>
          ) : null
        }
      />

      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="Custo total" value={brl(cost.totalCost)} hint={`rende ${num(cost.netYield, 1)} ${recipe.product.unit.toLowerCase()}`} />
        <StatCard label={`Custo por ${recipe.product.unit.toLowerCase()}`} value={brl(cost.costPerUnit)} tone="green" />
        <StatCard label="Preço mínimo" value={brl(pricing.minimumPrice)} hint="cobre custos e encargos" tone={pricing.belowMinimum ? "red" : "neutral"} />
      </div>

      <SectionTitle>Composição do custo</SectionTitle>
      <Card pad={false}>
        {cost.lines.map((line) => (
          <div key={line.productId} className="row">
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink-900">{line.name}</p>
              <p className="text-xs text-ink-500">
                {num(line.netQty, 3)} {line.unit.toLowerCase()}
                {D(line.lossPct).greaterThan(0) && ` (+${num(line.lossPct, 1)}% perda → ${num(line.grossQty, 3)})`}
                {" · "}{brl(line.unitCost)}/{line.unit.toLowerCase()}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold tabular-nums">{brl(line.totalCost)}</p>
              <p className="text-xs text-ink-500">{num(line.sharePct, 1)}%</p>
            </div>
          </div>
        ))}
        <div className="row"><span className="text-ink-600">Mão de obra</span><span className="font-semibold tabular-nums">{brl(cost.laborCost)}</span></div>
        <div className="row"><span className="text-ink-600">Energia</span><span className="font-semibold tabular-nums">{brl(cost.energyCost)}</span></div>
        <div className="row"><span className="text-ink-600">Outros custos</span><span className="font-semibold tabular-nums">{brl(cost.otherCost)}</span></div>
        <div className="row bg-ink-50">
          <span className="font-bold text-ink-900">Total</span>
          <span className="font-bold tabular-nums text-ink-900">{brl(cost.totalCost)}</span>
        </div>
      </Card>

      <SectionTitle>Preço sugerido</SectionTitle>
      <Card pad={false}>
        <div className="row"><span className="text-ink-600">Custo por {recipe.product.unit.toLowerCase()}</span><span className="font-semibold tabular-nums">{brl(cost.costPerUnit)}</span></div>
        {cost.costPerKg && recipe.product.unit !== "KG" && (
          <div className="row"><span className="text-ink-600">Custo por kg</span><span className="font-semibold tabular-nums">{brl(cost.costPerKg)}</span></div>
        )}
        <div className="row"><span className="text-ink-600">Encargos sobre a venda</span><span className="font-semibold tabular-nums">{num(pricing.chargesPct, 2)}%</span></div>
        <div className="row"><span className="text-ink-600">Preço mínimo</span><span className="font-semibold tabular-nums">{brl(pricing.minimumPrice)}</span></div>
        <div className="row"><span className="text-ink-600">Preço recomendado</span><span className="font-bold tabular-nums text-leaf-700">{brl(pricing.recommendedPrice)}</span></div>
        <div className="row">
          <span className="text-ink-600">Preço praticado hoje</span>
          <span className={`font-semibold tabular-nums ${pricing.belowMinimum ? "text-red-600" : "text-ink-900"}`}>
            {brl(recipe.product.salePrice)}
            {pricing.currentMarginPct && ` (${num(pricing.currentMarginPct, 1)}%)`}
          </span>
        </div>
      </Card>

      <div className="mt-3 flex flex-wrap gap-2">
        {can(user.permissions, "products.update") && <ApplyCostButton recipeId={recipe.id} />}
        <Link href={`/precificacao?produto=${recipe.productId}`} className="btn-ghost btn-sm">Calculadora de preço</Link>
        {can(user.permissions, "production.create") && (
          <Link href={`/producao/nova?produto=${recipe.productId}`} className="btn-primary btn-sm">Produzir</Link>
        )}
      </div>

      {recipe.notes && (
        <>
          <SectionTitle>Observações do processo</SectionTitle>
          <Card><p className="whitespace-pre-wrap text-sm text-ink-700">{recipe.notes}</p></Card>
        </>
      )}
    </div>
  );
}
