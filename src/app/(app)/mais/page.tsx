import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const MENU = [
  {
    group: "Cadastros",
    items: [
      { href: "/produtos", icon: "🍌", label: "Produtos e insumos", permission: "products.read" },
      { href: "/produtos?tipo=RAW", icon: "🌱", label: "Matérias-primas", permission: "products.read" },
      { href: "/clientes", icon: "👥", label: "Clientes", permission: "customers.read" },
      { href: "/fornecedores", icon: "🚚", label: "Fornecedores", permission: "suppliers.read" },
    ],
  },
  {
    group: "Operação",
    items: [
      { href: "/pedidos", icon: "📋", label: "Pedidos", permission: "orders.read" },
      { href: "/compras", icon: "🛒", label: "Compras", permission: "purchases.read" },
      { href: "/fichas-tecnicas", icon: "📐", label: "Fichas técnicas", permission: "recipes.read" },
      { href: "/estoque/lotes", icon: "🏷️", label: "Lotes e validade", permission: "stock.read" },
      { href: "/estoque/movimentos", icon: "🔁", label: "Movimentações", permission: "stock.read" },
    ],
  },
  {
    group: "Gestão",
    items: [
      { href: "/central-decisoes", icon: "🧠", label: "Central de Decisões", permission: "decisions.read" },
      { href: "/precificacao", icon: "🏷️", label: "Formação de preço", permission: "pricing.read" },
      { href: "/relatorios", icon: "📊", label: "Relatórios", permission: "reports.read" },
      { href: "/financeiro/fluxo-caixa", icon: "💵", label: "Fluxo de caixa", permission: "finance.read" },
      { href: "/financeiro/despesas", icon: "🧾", label: "Despesas", permission: "finance.read" },
    ],
  },
  {
    group: "Administração",
    items: [
      { href: "/configuracoes", icon: "⚙️", label: "Configurações", permission: "settings.read" },
      { href: "/configuracoes/descontos", icon: "％", label: "Política de descontos", permission: "pricing.read" },
      { href: "/usuarios", icon: "🔐", label: "Usuários e permissões", permission: "users.read" },
      { href: "/auditoria", icon: "📝", label: "Auditoria", permission: "audit.read" },
      { href: "/perfil", icon: "🙋", label: "Minha conta", permission: "dashboard.read" },
    ],
  },
];

export default async function MorePage() {
  const user = (await getCurrentUser())!;

  return (
    <div>
      <PageHeader title="Mais" subtitle={`${user.name} · ${user.roleName}`} />
      {MENU.map((section) => {
        const items = section.items.filter((i) => can(user.permissions, i.permission));
        if (items.length === 0) return null;
        return (
          <div key={section.group} className="mb-5">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">{section.group}</h2>
            <Card pad={false}>
              {items.map((item) => (
                <Link key={item.href} href={item.href} className="block active:bg-ink-50">
                  <div className="row">
                    <span className="flex items-center gap-3 font-medium text-ink-800">
                      <span className="w-6 text-center text-lg" aria-hidden>{item.icon}</span>
                      {item.label}
                    </span>
                    <span className="text-ink-400">›</span>
                  </div>
                </Link>
              ))}
            </Card>
          </div>
        );
      })}

      <form action="/api/auth/logout" method="post" className="mt-6">
        <button type="submit" className="btn-ghost w-full !text-red-600">Sair do sistema</button>
      </form>
    </div>
  );
}
