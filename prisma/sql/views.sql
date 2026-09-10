-- Views compatíveis com a nomenclatura pedida na especificação.
-- Evitam duplicação de dados: são apenas recortes das tabelas base.

CREATE OR REPLACE VIEW production_batches AS
SELECT b.id, b."companyId", b."warehouseId", b."productId", b.code,
       b."producedQty", b."availableQty", b."unitCost",
       b."manufacturedAt", b."expiresAt", b."productionOrderId", b.notes,
       b."createdAt"
FROM batches b
WHERE b.origin = 'PRODUCTION';

CREATE OR REPLACE VIEW accounts_payable AS
SELECT f.* FROM finance_entries f
WHERE f.direction = 'PAYABLE' AND f."deletedAt" IS NULL;

CREATE OR REPLACE VIEW accounts_receivable AS
SELECT f.* FROM finance_entries f
WHERE f.direction = 'RECEIVABLE' AND f."deletedAt" IS NULL;
