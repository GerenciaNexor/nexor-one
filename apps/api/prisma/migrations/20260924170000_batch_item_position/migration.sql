-- Orden de carga de cada ítem del lote (para mostrar las facturas en el mismo orden que se subieron).
ALTER TABLE "quick_invoice_batch_items" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
