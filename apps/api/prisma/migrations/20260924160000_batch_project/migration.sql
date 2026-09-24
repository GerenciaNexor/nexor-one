-- Proyecto por defecto del lote (se aplica a cada factura registrada).
ALTER TABLE "quick_invoice_batches" ADD COLUMN "project_id" VARCHAR(30);
