-- HU-191 — Carga de factura por imagen (OCR) en el registro rápido de compra/venta.
-- Guarda la factura COMPLETA leída (lo sin columna propia va a full_extraction JSONB) + la imagen
-- comprimida (miniatura, para trazabilidad). Las transacciones/movimientos de stock generados al
-- confirmar viven en transactions/stock_movements (referenceType quick_purchase/quick_sale).

-- CreateTable
CREATE TABLE "quick_invoices" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "branch_id" VARCHAR(30),
    "user_id" VARCHAR(30),
    "kind" VARCHAR(20) NOT NULL,
    "issuer" VARCHAR(255),
    "nit" VARCHAR(50),
    "invoice_date" DATE,
    "total" DECIMAL(15,2),
    "full_extraction" JSONB NOT NULL,
    "image_data" BYTEA,
    "image_mime" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quick_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quick_invoices_tenant_id_created_at_idx" ON "quick_invoices"("tenant_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "quick_invoices" ADD CONSTRAINT "quick_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
