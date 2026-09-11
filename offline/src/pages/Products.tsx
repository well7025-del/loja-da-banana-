import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { D } from "@/lib/money";
import { brl, num } from "@/lib/format";
import { PRODUCT_KIND_LABELS } from "@/lib/defaults";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";

export default function ProductsPage() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");

  const products = useLiveQuery(async () => {
    const all = (await db.products.toArray()).filter((p) => !p.deletedAt);
    const needle = query.trim().toLowerCase();
    return all
      .filter((p) => !kind || p.kind === kind)
      .filter((p) => !needle ||
        p.name.toLowerCase().includes(needle) ||
        p.sku.toLowerCase().includes(needle) ||
        (p.barcode ?? "").includes(needle))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  }, [query, kind]);

  return (
    <div>
      <PageHeader
        title="Produtos e insumos"
        subtitle={products ? `${products.length} item(ns)` : undefined}
        action={<Link to="/produtos/novo" className="btn-banana btn-sm">+ Novo</Link>}
      />

      <div className="space-y-2">
        <input
          type="search" className="input" value={query} aria-label="Buscar produto"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome, código ou código de barras"
        />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[{ value: "", label: "Todos" },
            ...Object.entries(PRODUCT_KIND_LABELS).map(([value, label]) => ({ value, label }))]
            .map((option) => (
              <button key={option.value} type="button" onClick={() => setKind(option.value)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                  kind === option.value
                    ? "bg-leaf-600 text-white"
                    : "border border-[var(--border)] bg-white text-ink-600"
                }`}>
                {option.label}
              </button>
            ))}
        </div>
      </div>

      <div className="mt-3">
        {!products ? <Spinner /> : products.length === 0 ? (
          <EmptyState title="Nenhum produto encontrado"
            action={<Link to="/produtos/novo" className="btn-primary btn-sm">Cadastrar produto</Link>} />
        ) : (
          <Card pad={false}>
            {products.map((product) => {
              const stock = D(product.quantity);
              const low = D(product.minStock).greaterThan(0) && stock.lessThan(D(product.minStock));
              return (
                <Link key={product.id} to={`/produtos/${product.id}`} className="block active:bg-ink-50">
                  <div className="row">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-ink-900">{product.name}</span>
                        {!product.active && <Badge>inativo</Badge>}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-ink-500">
                        {product.sku} · {PRODUCT_KIND_LABELS[product.kind]}
                        {product.category && ` · ${product.category}`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`font-semibold tabular-nums ${low ? "text-red-600" : "text-ink-900"}`}>
                        {num(stock, 1)} {product.unit.toLowerCase()}
                      </div>
                      <div className="text-xs text-ink-500">
                        {D(product.salePrice).greaterThan(0)
                          ? brl(product.salePrice)
                          : `custo ${brl(product.avgCost)}`}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
