import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { computeRecipeCost } from "@/logic/costing";
import { brl, num } from "@/lib/format";
import { Card, EmptyState, PageHeader, Spinner } from "@/components/ui";

export default function RecipesPage() {
  const data = useLiveQuery(async () => {
    const [recipes, products] = await Promise.all([
      db.recipes.toArray(), db.products.toArray(),
    ]);
    const byId = new Map(products.map((p) => [p.id, p]));

    const rows = recipes
      .filter((r) => !r.deletedAt)
      .map((recipe) => {
        const product = byId.get(recipe.productId);
        if (!product) return null;
        return { recipe, product, cost: computeRecipeCost(recipe, product, byId) };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.product.name.localeCompare(b.product.name));

    const withRecipe = new Set(rows.map((r) => r.product.id));
    const without = products.filter(
      (p) => !p.deletedAt && p.kind === "FINISHED" && !withRecipe.has(p.id),
    );

    return { rows, without };
  }, []);

  if (!data) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Fichas técnicas"
        subtitle="Custo real de cada produto fabricado"
        action={<Link to="/fichas-tecnicas/nova" className="btn-banana btn-sm">+ Nova</Link>}
      />

      {data.rows.length === 0 ? (
        <EmptyState icon="📋" title="Nenhuma ficha técnica"
          detail="A ficha define os insumos, o rendimento e o custo real de cada produto."
          action={<Link to="/fichas-tecnicas/nova" className="btn-primary btn-sm">Criar a primeira</Link>} />
      ) : (
        <Card pad={false}>
          {data.rows.map(({ recipe, product, cost }) => (
            <Link key={recipe.id} to={`/fichas-tecnicas/${recipe.id}`} className="block active:bg-ink-50">
              <div className="row">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">{product.name}</p>
                  <p className="text-xs text-ink-500">
                    {recipe.items.length} item(ns) · rende {num(cost.netYield, 1)} {product.unit.toLowerCase()}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums text-ink-900">{brl(cost.costPerUnit)}</p>
                  <p className="text-xs text-ink-500">por {product.unit.toLowerCase()}</p>
                </div>
              </div>
            </Link>
          ))}
        </Card>
      )}

      {data.without.length > 0 && (
        <>
          <p className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-ink-500">Sem ficha técnica</p>
          <Card pad={false}>
            {data.without.map((product) => (
              <Link key={product.id} to={`/fichas-tecnicas/nova?produto=${product.id}`}
                className="block active:bg-ink-50">
                <div className="row">
                  <span className="font-medium text-ink-800">{product.name}</span>
                  <span className="text-sm font-semibold text-leaf-700">Criar ficha →</span>
                </div>
              </Link>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
