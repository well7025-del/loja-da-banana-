/** Constantes compartilhadas entre servidor, cliente e scripts (sem "server-only"). */
import type { FinanceDirection } from "@prisma/client";

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
  SALE: "Venda", LOSS: "Perda", ADJUSTMENT: "Ajuste", TRANSFER_IN: "Transferência (entrada)",
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
