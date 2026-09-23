-- HU-212 — Carga masiva de facturas por OCR (lotes).
CREATE TABLE "quick_invoice_batches" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "user_id" VARCHAR(30),
    "kind" VARCHAR(20) NOT NULL,
    "branch_id" VARCHAR(30),
    "mode" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'processing',
    "total" INTEGER NOT NULL,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "notified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "quick_invoice_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quick_invoice_batch_items" (
    "id" VARCHAR(30) NOT NULL,
    "batch_id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "image_data" BYTEA,
    "image_mime" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "issuer" VARCHAR(255),
    "nit" VARCHAR(50),
    "invoice_number" VARCHAR(100),
    "invoice_date" DATE,
    "total" DECIMAL(15,2),
    "proposal" JSONB,
    "error" TEXT,
    "duplicate_of" VARCHAR(100),
    "registered_invoice_id" VARCHAR(30),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "quick_invoice_batch_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quick_invoice_batches_tenant_id_kind_created_at_idx" ON "quick_invoice_batches"("tenant_id", "kind", "created_at" DESC);
CREATE INDEX "quick_invoice_batch_items_batch_id_idx" ON "quick_invoice_batch_items"("batch_id");
CREATE INDEX "quick_invoice_batch_items_tenant_id_idx" ON "quick_invoice_batch_items"("tenant_id");

ALTER TABLE "quick_invoice_batches" ADD CONSTRAINT "quick_invoice_batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quick_invoice_batch_items" ADD CONSTRAINT "quick_invoice_batch_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "quick_invoice_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
