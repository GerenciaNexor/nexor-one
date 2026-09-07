-- HU-196 — Tipo de documento del emisor/contraparte en la factura del registro rápido (NIT, CC, CE, …).
-- Puede autocompletarse del proveedor existente o ingresarse a mano si es ocasional.

-- AlterTable
ALTER TABLE "quick_invoices" ADD COLUMN "document_type" VARCHAR(10);
