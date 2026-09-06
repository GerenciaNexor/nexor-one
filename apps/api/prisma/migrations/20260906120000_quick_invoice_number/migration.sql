-- HU-195 — Número/código de la factura como campo dedicado (compras y ventas). Antes solo vivía en
-- full_extraction (info adicional); ahora es una columna propia, editable, visible y buscable.

-- AlterTable
ALTER TABLE "quick_invoices" ADD COLUMN "invoice_number" VARCHAR(100);
