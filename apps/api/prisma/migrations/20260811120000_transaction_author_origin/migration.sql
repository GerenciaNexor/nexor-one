-- HU-194-C — cada registro rápido guarda QUIÉN lo ingresó (created_by) y su ORIGEN
-- (quick_invoice_id != null → vino de una factura OCR y liga con quick_invoices; null → manual).

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "created_by" VARCHAR(30);
ALTER TABLE "transactions" ADD COLUMN "quick_invoice_id" VARCHAR(30);

-- CreateIndex
CREATE INDEX "transactions_tenant_id_quick_invoice_id_idx" ON "transactions"("tenant_id", "quick_invoice_id");
