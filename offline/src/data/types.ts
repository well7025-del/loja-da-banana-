/**
 * Tipos do ERP offline.
 *
 * Valores decimais são guardados como TEXTO ("4.5"), nunca como número de
 * ponto flutuante: dinheiro e custo médio não toleram o arredondamento
 * binário do JavaScript. A leitura converte para Decimal.
 */

export type Num = string;

export type ProductKind = "FINISHED" | "RAW" | "PACKAGING" | "RESALE";
export type Unit = "KG" | "G" | "L" | "ML" | "UN" | "CX" | "PCT" | "FD";
export type MovementType = "IN" | "OUT" | "ADJUST";
export type MovementReason =
  | "PURCHASE" | "PRODUCTION_IN" | "PRODUCTION_OUT" | "SALE" | "LOSS"
  | "ADJUSTMENT" | "RETURN_IN" | "OPENING";
export type BatchOrigin = "PRODUCTION" | "PURCHASE" | "ADJUSTMENT";
export type ProductionStatus = "PLANNED" | "IN_PROGRESS" | "FINISHED" | "CANCELLED";
export type SaleChannel = "RETAIL" | "WHOLESALE";
export type SaleStatus = "COMPLETED" | "CANCELLED";
export type PaymentMethod = "PIX" | "CASH" | "CARD" | "TRANSFER" | "TERM";
export type CustomerType =
  | "CONSUMER" | "STORE" | "MARKET" | "RESTAURANT" | "DISTRIBUTOR" | "REPRESENTATIVE" | "OTHER";
export type FinanceDirection = "PAYABLE" | "RECEIVABLE";
export type FinanceStatus = "OPEN" | "PARTIAL" | "PAID" | "CANCELLED";
export type PriceRuleType = "QTY_DISCOUNT" | "ORDER_VALUE" | "CUSTOMER_TYPE";

export type Product = {
  id: string;
  kind: ProductKind;
  sku: string;
  name: string;
  barcode?: string | null;
  category?: string | null;
  unit: Unit;
  netWeightKg?: Num | null;
  salePrice: Num;
  wholesalePrice: Num;
  /** Custo médio ponderado, recalculado a cada entrada. */
  avgCost: Num;
  lastCost: Num;
  targetMargin: Num;
  minStock: Num;
  maxStock?: Num | null;
  shelfLifeDays?: number | null;
  trackBatches: boolean;
  /** Saldo atual — o app offline trabalha com um único local de estoque. */
  quantity: Num;
  imageUrl?: string | null;
  notes?: string | null;
  /** Dados de matéria-prima */
  supplierName?: string | null;
  standardLossPct?: Num | null;
  active: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Batch = {
  id: string;
  productId: string;
  code: string;
  origin: BatchOrigin;
  producedQty: Num;
  availableQty: Num;
  unitCost: Num;
  manufacturedAt: string;
  expiresAt?: string | null;
  productionId?: string | null;
  supplierName?: string | null;
  notes?: string | null;
  createdAt: string;
};

export type Movement = {
  id: string;
  productId: string;
  batchId?: string | null;
  type: MovementType;
  reason: MovementReason;
  quantity: Num;
  unitCost: Num;
  totalCost: Num;
  balanceAfter: Num;
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
  createdAt: string;
};

export type RecipeItem = {
  productId: string;
  quantity: Num;
  unit: Unit;
  lossPct: Num;
  /** Ingrediente base do cálculo de rendimento (ex.: a banana). */
  isMain: boolean;
  note?: string | null;
};

export type Recipe = {
  id: string;
  productId: string;
  name: string;
  yieldQty: Num;
  expectedLossPct: Num;
  laborCost: Num;
  energyCost: Num;
  otherCost: Num;
  notes?: string | null;
  items: RecipeItem[];
  active: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Consumption = {
  productId: string;
  plannedQty: Num;
  actualQty: Num;
  unitCost: Num;
  totalCost: Num;
};

export type Production = {
  id: string;
  code: string;
  productId: string;
  recipeId?: string | null;
  status: ProductionStatus;
  plannedQty: Num;
  producedQty?: Num | null;
  lossQty: Num;
  materialCost: Num;
  overheadCost: Num;
  totalCost: Num;
  unitCost: Num;
  inputQty: Num;
  expectedYieldPct?: Num | null;
  actualYieldPct?: Num | null;
  consumptions: Consumption[];
  batchCode?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  notes?: string | null;
  createdAt: string;
};

export type Customer = {
  id: string;
  name: string;
  type: CustomerType;
  taxId?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  city?: string | null;
  address?: string | null;
  creditLimit: Num;
  defaultDiscountPct: Num;
  paymentTerms?: string | null;
  notes?: string | null;
  active: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaleItem = {
  productId: string;
  batchId?: string | null;
  quantity: Num;
  unitPrice: Num;
  discountPct: Num;
  discount: Num;
  total: Num;
  unitCost: Num;
  totalCost: Num;
};

export type Sale = {
  id: string;
  number: string;
  customerId?: string | null;
  channel: SaleChannel;
  status: SaleStatus;
  items: SaleItem[];
  subtotal: Num;
  discount: Num;
  freight: Num;
  total: Num;
  costTotal: Num;
  grossProfit: Num;
  marginPct: Num;
  paymentMethod: PaymentMethod;
  installments: number;
  dueDate?: string | null;
  soldAt: string;
  notes?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
};

export type Payment = {
  amount: Num;
  method: PaymentMethod;
  paidAt: string;
  note?: string | null;
};

export type FinanceEntry = {
  id: string;
  direction: FinanceDirection;
  status: FinanceStatus;
  description: string;
  category?: string | null;
  customerId?: string | null;
  supplierName?: string | null;
  saleId?: string | null;
  amount: Num;
  paidAmount: Num;
  dueDate: string;
  issuedAt: string;
  paidAt?: string | null;
  installment: number;
  installments: number;
  payments: Payment[];
  notes?: string | null;
  deletedAt?: string | null;
};

export type PriceRule = {
  id: string;
  name: string;
  type: PriceRuleType;
  minQty: Num;
  minValue: Num;
  discountPct: Num;
  channel?: SaleChannel | null;
  customerType?: CustomerType | null;
  productId?: string | null;
  priority: number;
  active: boolean;
};

export type Setting = { key: string; value: string };

/** Registro de tudo o que foi feito, para conferência posterior. */
export type LogEntry = {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  createdAt: string;
};
