/** Constantes da operação — iguais às da versão web, sem dependência de banco. */
export type FinanceDirection = "PAYABLE" | "RECEIVABLE";

export const DEFAULT_CATEGORIES: { name: string; direction: FinanceDirection }[] = [
  { name: "Matéria-prima", direction: "PAYABLE" },
  { name: "Embalagem", direction: "PAYABLE" },
  { name: "Energia", direction: "PAYABLE" },
  { name: "Água", direction: "PAYABLE" },
  { name: "Aluguel", direction: "PAYABLE" },
  { name: "Salários", direction: "PAYABLE" },
  { name: "Transporte", direction: "PAYABLE" },
  { name: "Manutenção", direction: "PAYABLE" },
  { name: "Marketing", direction: "PAYABLE" },
  { name: "Impostos", direction: "PAYABLE" },
  { name: "Outros", direction: "PAYABLE" },
  { name: "Vendas", direction: "RECEIVABLE" },
  { name: "Outras receitas", direction: "RECEIVABLE" },
];

export type CompanySettings = {
  taxPct: string;
  fixedOverheadPct: string;
  commissionPct: string;
  cardFeePct: string;
  defaultTargetMarginPct: string;
  allowNegativeStock: string;
  expiryAlertDays: string;
  inactiveCustomerDays: string;
  productionCoverageDays: string;
  purchaseCoverageDays: string;
  // Dados da loja, usados no comprovante e no catálogo
  storeName: string;
  storeDocument: string;
  storeAddress: string;
  storeCity: string;
  storeWhatsapp: string;
  receiptFooter: string;
  // Recebimento por Pix
  pixEnabled: string;
  pixKey: string;
  pixKeyType: string;
  pixHolder: string;
  pixCity: string;
  // Conferência do extrato
  reconcileDaysTolerance: string;
  cardDaysTolerance: string;
  cardFeeTolerancePct: string;
};

export const DEFAULT_SETTINGS: CompanySettings = {
  taxPct: "6",
  fixedOverheadPct: "10",
  commissionPct: "0",
  cardFeePct: "3",
  defaultTargetMarginPct: "30",
  allowNegativeStock: "false",
  expiryAlertDays: "30",
  inactiveCustomerDays: "30",
  productionCoverageDays: "15",
  purchaseCoverageDays: "20",
  storeName: "Loja da Banana",
  storeDocument: "",
  storeAddress: "",
  storeCity: "",
  storeWhatsapp: "",
  receiptFooter: "Obrigado pela preferência!",
  pixEnabled: "false",
  pixKey: "",
  pixKeyType: "AUTO",
  pixHolder: "",
  pixCity: "",
  reconcileDaysTolerance: "3",
  cardDaysTolerance: "45",
  cardFeeTolerancePct: "8",
};

export const SETTING_LABELS: Record<keyof CompanySettings, { label: string; help: string; suffix?: string }> = {
  taxPct: { label: "Impostos sobre a venda", help: "Percentual médio de impostos", suffix: "%" },
  fixedOverheadPct: { label: "Rateio de despesas fixas", help: "Quanto das despesas fixas o preço deve cobrir", suffix: "%" },
  commissionPct: { label: "Comissão de vendas", help: "Comissão média de vendedores e representantes", suffix: "%" },
  cardFeePct: { label: "Taxa de cartão", help: "Taxa média cobrada pelas maquininhas", suffix: "%" },
  defaultTargetMarginPct: { label: "Margem desejada", help: "Margem padrão usada na formação de preço", suffix: "%" },
  allowNegativeStock: { label: "Permitir estoque negativo", help: "Libera venda sem saldo disponível" },
  expiryAlertDays: { label: "Alerta de validade", help: "Avisar sobre lotes que vencem em até X dias", suffix: " dias" },
  inactiveCustomerDays: { label: "Cliente inativo", help: "Alertar cliente sem compras há X dias", suffix: " dias" },
  productionCoverageDays: { label: "Cobertura de produção", help: "Dias de venda que a produção sugerida deve cobrir", suffix: " dias" },
  purchaseCoverageDays: { label: "Cobertura de compra", help: "Dias de consumo que a compra sugerida deve cobrir", suffix: " dias" },
  storeName: { label: "Nome da loja", help: "Aparece no comprovante e no catálogo" },
  storeDocument: { label: "CNPJ ou CPF", help: "Opcional, aparece no comprovante" },
  storeAddress: { label: "Endereço", help: "Rua, número e bairro" },
  storeCity: { label: "Cidade", help: "Cidade e estado" },
  storeWhatsapp: { label: "WhatsApp da loja", help: "Com DDD, só números" },
  receiptFooter: { label: "Mensagem do rodapé", help: "Texto final do comprovante" },
  pixEnabled: { label: "Mostrar Pix no comprovante", help: "Inclui a chave e o copia e cola" },
  pixKey: { label: "Chave Pix", help: "CPF/CNPJ, telefone, e-mail ou chave aleatória" },
  pixKeyType: { label: "Tipo da chave", help: "Deixe em automático se não tiver certeza" },
  pixHolder: { label: "Nome do beneficiário", help: "Como está cadastrado no banco" },
  pixCity: { label: "Cidade do beneficiário", help: "Exigida pelo padrão do Pix" },
  reconcileDaysTolerance: { label: "Tolerância de dias (Pix)", help: "Diferença aceita entre a venda e o crédito", suffix: " dias" },
  cardDaysTolerance: { label: "Tolerância de dias (cartão)", help: "Prazo máximo de repasse da maquininha", suffix: " dias" },
  cardFeeTolerancePct: { label: "Taxa máxima de cartão", help: "Diferença aceita entre a venda e o repasse", suffix: "%" },
};

export const UNIT_LABELS: Record<string, string> = {
  KG: "kg", G: "g", L: "L", ML: "ml", UN: "un", CX: "cx", PCT: "pct", FD: "fd",
};

export const PRODUCT_KIND_LABELS: Record<string, string> = {
  FINISHED: "Produto acabado",
  RAW: "Matéria-prima",
  PACKAGING: "Embalagem",
  RESALE: "Revenda",
};

export const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  CONSUMER: "Consumidor final",
  STORE: "Loja",
  MARKET: "Mercado",
  RESTAURANT: "Restaurante",
  DISTRIBUTOR: "Distribuidor",
  REPRESENTATIVE: "Representante",
  OTHER: "Outro",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  PIX: "Pix", CASH: "Dinheiro", CARD: "Cartão", TRANSFER: "Transferência", TERM: "A prazo",
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  NEW: "Novo", CONFIRMED: "Confirmado", PICKING: "Em separação",
  IN_PRODUCTION: "Em produção", READY: "Pronto", DISPATCHED: "Despachado",
  DELIVERED: "Entregue", CANCELLED: "Cancelado",
};

export const ORDER_FLOW = [
  "NEW", "CONFIRMED", "PICKING", "IN_PRODUCTION", "READY", "DISPATCHED", "DELIVERED",
] as const;

export const PRODUCTION_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planejada", IN_PROGRESS: "Em andamento", FINISHED: "Finalizada", CANCELLED: "Cancelada",
};

export const MOVEMENT_REASON_LABELS: Record<string, string> = {
  PURCHASE: "Compra", PRODUCTION_IN: "Produção", PRODUCTION_OUT: "Consumo na produção",
  SALE: "Venda", LOSS: "Perda", ADJUSTMENT: "Ajuste", INVENTORY: "Inventário",
  TRANSFER_IN: "Transferência (entrada)",
  TRANSFER_OUT: "Transferência (saída)", RETURN_IN: "Devolução (entrada)",
  RETURN_OUT: "Devolução (saída)", OPENING: "Saldo inicial",
};

export const FINANCE_STATUS_LABELS: Record<string, string> = {
  OPEN: "Em aberto", PARTIAL: "Parcial", PAID: "Quitado", CANCELLED: "Cancelado",
};

export const PURCHASE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho", ORDERED: "Pedido feito", PARTIAL: "Recebido parcial",
  RECEIVED: "Recebido", CANCELLED: "Cancelado",
};

export const ACCOUNT_KIND_LABELS: Record<string, string> = {
  CASH: "Caixa", BANK: "Conta bancária", CARD: "Maquininha / cartão",
};

export const STATEMENT_KIND_LABELS: Record<string, string> = {
  BANK: "Extrato bancário", CARD: "Extrato de cartão",
};

export const STATEMENT_LINE_STATUS_LABELS: Record<string, string> = {
  PENDING: "A conferir", MATCHED: "Conferido", POSTED: "Lançado", IGNORED: "Ignorado",
};

export const INVENTORY_STATUS_LABELS: Record<string, string> = {
  OPEN: "Em contagem", CLOSED: "Fechado", CANCELLED: "Cancelado",
};

/**
 * Ajustes extraordinários de estoque.
 * Todos pedem justificativa e aceitam o documento que autoriza o lançamento.
 */
export const STOCK_ADJUSTMENT_KINDS = [
  { id: "LOSS", label: "Perda", icon: "🗑️", direction: "OUT",
    help: "Quebra, vencimento, avaria ou descarte." },
  { id: "RETURN_IN", label: "Devolução", icon: "↩️", direction: "IN",
    help: "Mercadoria que voltou do cliente." },
  { id: "INVENTORY", label: "Inventário", icon: "📋", direction: "SET",
    help: "Acerta o saldo pela contagem física." },
  { id: "ADJUSTMENT", label: "Balanço", icon: "⚖️", direction: "SET",
    help: "Correção pontual de saldo com justificativa." },
] as const;

export type StockAdjustmentKind = (typeof STOCK_ADJUSTMENT_KINDS)[number]["id"];

/** Teto por arquivo: tudo isso vai dentro do backup em JSON. */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const WARN_ATTACHMENT_BYTES = 700 * 1024;
