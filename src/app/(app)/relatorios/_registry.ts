export type ReportDef = {
  slug: string;
  title: string;
  description: string;
  icon: string;
  group: string;
  permission: string;
};

export const REPORTS: ReportDef[] = [
  { slug: "vendas", title: "Vendas por período", description: "Faturamento, lucro e ticket médio", icon: "📈", group: "Vendas", permission: "reports.read" },
  { slug: "vendas-produto", title: "Vendas por produto", description: "Quanto cada produto vendeu", icon: "🍌", group: "Vendas", permission: "reports.read" },
  { slug: "vendas-cliente", title: "Vendas por cliente", description: "Quem mais compra e o ticket médio", icon: "👥", group: "Vendas", permission: "reports.read" },
  { slug: "vendas-vendedor", title: "Vendas por vendedor", description: "Desempenho da equipe", icon: "🧑‍💼", group: "Vendas", permission: "reports.read" },
  { slug: "margem", title: "Lucro e margem por produto", description: "Qual produto dá mais lucro", icon: "💰", group: "Vendas", permission: "reports.read" },

  { slug: "estoque", title: "Posição de estoque", description: "Saldo e valor imobilizado", icon: "📦", group: "Estoque", permission: "reports.read" },
  { slug: "estoque-parado", title: "Estoque parado", description: "Itens sem movimento há 60 dias", icon: "🕰️", group: "Estoque", permission: "reports.read" },
  { slug: "perdas", title: "Perdas", description: "Quanto foi descartado e o custo", icon: "🗑️", group: "Estoque", permission: "reports.read" },

  { slug: "producao", title: "Produção", description: "Volume produzido e custo real", icon: "🏭", group: "Produção", permission: "reports.read" },
  { slug: "rendimento", title: "Rendimento", description: "Rendimento médio, melhor e pior", icon: "⚗️", group: "Produção", permission: "reports.read" },

  { slug: "compras", title: "Compras", description: "Quanto foi comprado no período", icon: "🚚", group: "Compras", permission: "reports.read" },
  { slug: "fornecedores", title: "Fornecedores", description: "Volume por fornecedor", icon: "🏢", group: "Compras", permission: "reports.read" },

  { slug: "receber", title: "Contas a receber", description: "Títulos por vencimento e categoria", icon: "🧾", group: "Financeiro", permission: "reports.read" },
  { slug: "pagar", title: "Contas a pagar", description: "Títulos por vencimento e categoria", icon: "💳", group: "Financeiro", permission: "reports.read" },
  { slug: "fluxo-caixa", title: "Fluxo de caixa", description: "Entradas e saídas dia a dia", icon: "💵", group: "Financeiro", permission: "reports.read" },
];
