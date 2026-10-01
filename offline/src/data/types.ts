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
  | "ADJUSTMENT" | "RETURN_IN" | "OPENING" | "INVENTORY" | "RETURN_OUT";
export type BatchOrigin = "PRODUCTION" | "PURCHASE" | "ADJUSTMENT";
export type ProductionStatus = "PLANNED" | "IN_PROGRESS" | "FINISHED" | "CANCELLED";
export type SaleChannel = "RETAIL" | "WHOLESALE";
export type SaleStatus = "COMPLETED" | "CANCELLED";
/** TERM permanece só para ler vendas antigas: a venda a prazo saiu do app. */
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
  /** Foto do produto, guardada como data URL já reduzida. */
  imageUrl?: string | null;
  /** Comissão paga sobre a venda deste produto. */
  commissionPct?: Num | null;
  /** Faixas de desconto por quantidade específicas deste produto. */
  qtyDiscounts?: QtyDiscount[];
  notes?: string | null;
  /** Dados de matéria-prima */
  supplierName?: string | null;
  standardLossPct?: Num | null;
  active: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** "A partir de X kg, Y% de desconto" — cadastrado no próprio produto. */
export type QtyDiscount = { minQty: Num; discountPct: Num };

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
  /** Documento que autoriza o lançamento (ajustes extraordinários). */
  attachmentId?: string | null;
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
  /** Congelados na venda: mudar a comissão depois não reescreve o passado. */
  commissionPct: Num;
  commissionValue: Num;
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
  /** Alterar uma venda gera uma nova versão; a anterior fica cancelada. */
  revision?: number;
  replacesSaleId?: string | null;
  replacedBySaleId?: string | null;
  /** Conferida contra o extrato bancário. */
  reconciledAt?: string | null;
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
  accountId?: string | null;
  attachmentId?: string | null;
  reconciledAt?: string | null;
  statementLineId?: string | null;
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

// ---------------------------------------------------------------------------
// Documentos anexados
// ---------------------------------------------------------------------------

/**
 * Arquivo guardado dentro do aparelho e incluído no backup.
 *
 * O conteúdo vai em base64 porque o backup é um JSON: um Blob não
 * sobreviveria à exportação. Por isso o tamanho é limitado — ver
 * `MAX_ATTACHMENT_BYTES`.
 */
export type Attachment = {
  id: string;
  /** "Movement", "Sale", "FinanceEntry", "PriceChange", "Inventory", "Transfer" */
  entity: string;
  entityId: string;
  name: string;
  mime: string;
  size: number;
  /** base64 puro, sem o prefixo "data:". */
  data: string;
  note?: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Auditoria de preço
// ---------------------------------------------------------------------------

export type PriceField = "salePrice" | "wholesalePrice";

export type PriceChange = {
  id: string;
  productId: string;
  field: PriceField;
  oldValue: Num;
  newValue: Num;
  reason: string;
  attachmentId?: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Inventário
// ---------------------------------------------------------------------------

export type InventoryStatus = "OPEN" | "CLOSED" | "CANCELLED";

export type InventoryItem = {
  productId: string;
  /** Saldo do sistema no momento da abertura — a base da conferência. */
  systemQty: Num;
  countedQty?: Num | null;
  unitCost: Num;
  countedAt?: string | null;
};

export type Inventory = {
  id: string;
  code: string;
  status: InventoryStatus;
  scope: string;
  items: InventoryItem[];
  note?: string | null;
  attachmentId?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  /** Divergência apurada no fechamento. */
  diffValue?: Num | null;
};

// ---------------------------------------------------------------------------
// Contas, transferências e extratos
// ---------------------------------------------------------------------------

export type AccountKind = "CASH" | "BANK" | "CARD";

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  active: boolean;
  createdAt: string;
};

export type Transfer = {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: Num;
  description: string;
  happenedAt: string;
  attachmentId?: string | null;
  createdAt: string;
  deletedAt?: string | null;
};

export type StatementKind = "BANK" | "CARD";

export type Statement = {
  id: string;
  accountId: string;
  kind: StatementKind;
  fileName: string;
  importedAt: string;
  from: string;
  to: string;
  lineCount: number;
};

export type StatementLineStatus =
  /** Ainda não conferida. */
  | "PENDING"
  /** Casada com venda(s) ou título(s) já existentes. */
  | "MATCHED"
  /** Virou lançamento no financeiro. */
  | "POSTED"
  /** Marcada como "não interessa" (transferência própria, estorno…). */
  | "IGNORED";

export type StatementSuggestion = {
  direction: FinanceDirection;
  category: string;
  description: string;
};

export type StatementLine = {
  id: string;
  statementId: string;
  /** Data do lançamento no extrato (ISO). */
  date: string;
  description: string;
  /** Positivo = crédito, negativo = débito. */
  amount: Num;
  /** Evita importar a mesma linha duas vezes. */
  fingerprint: string;
  status: StatementLineStatus;
  matchedSaleIds: string[];
  matchedFinanceIds: string[];
  /** Diferença entre o valor da venda e o creditado (taxa de cartão). */
  feeAmount?: Num | null;
  suggestion?: StatementSuggestion | null;
  note?: string | null;
  createdAt: string;
};
