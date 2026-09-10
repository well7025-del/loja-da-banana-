/**
 * Permissões no formato "modulo.acao". "*" = acesso total.
 * "modulo.*" libera todas as ações do módulo.
 */
export const MODULES = [
  "dashboard", "products", "stock", "recipes", "production", "sales",
  "orders", "customers", "purchases", "suppliers", "finance", "pricing",
  "reports", "decisions", "settings", "users", "audit",
] as const;

export type ModuleName = (typeof MODULES)[number];
export type Action = "read" | "create" | "update" | "delete";
export type Permission = `${ModuleName}.${Action}` | `${ModuleName}.*` | "*";

export const ROLE_PRESETS: Record<
  string,
  { name: string; description: string; permissions: string[] }
> = {
  ADMIN: {
    name: "Administrador",
    description: "Acesso total ao sistema",
    permissions: ["*"],
  },
  GERENTE: {
    name: "Gerente",
    description: "Visão completa da operação, sem gestão de usuários",
    permissions: [
      "dashboard.*", "products.*", "stock.*", "recipes.*", "production.*",
      "sales.*", "orders.*", "customers.*", "purchases.*", "suppliers.*",
      "finance.*", "pricing.*", "reports.*", "decisions.*", "settings.read",
    ],
  },
  PRODUCAO: {
    name: "Produção",
    description: "Registra produções e consulta fichas técnicas e estoque",
    permissions: [
      "dashboard.read", "production.*", "recipes.read", "stock.read",
      "stock.create", "products.read", "reports.read",
    ],
  },
  ESTOQUE: {
    name: "Estoque",
    description: "Entradas, saídas, ajustes e recebimento de compras",
    permissions: [
      "dashboard.read", "stock.*", "products.read", "products.update",
      "purchases.read", "purchases.update", "suppliers.read",
      "production.read", "reports.read",
    ],
  },
  VENDAS: {
    name: "Vendas",
    description: "Vendas, pedidos e clientes",
    permissions: [
      "dashboard.read", "sales.*", "orders.*", "customers.*",
      "products.read", "stock.read", "reports.read",
    ],
  },
  FINANCEIRO: {
    name: "Financeiro",
    description: "Contas a pagar, a receber, fluxo de caixa e precificação",
    permissions: [
      "dashboard.read", "finance.*", "pricing.*", "reports.*",
      "customers.read", "suppliers.read", "sales.read", "purchases.read",
      "products.read",
    ],
  },
};

export function can(permissions: string[] | undefined, required: string): boolean {
  if (!permissions?.length) return false;
  if (permissions.includes("*")) return true;
  if (permissions.includes(required)) return true;
  const [mod] = required.split(".");
  return permissions.includes(`${mod}.*`);
}

export function canAny(permissions: string[] | undefined, required: string[]): boolean {
  return required.some((r) => can(permissions, r));
}
