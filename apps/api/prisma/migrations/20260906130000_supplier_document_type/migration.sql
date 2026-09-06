-- HU-196 — Tipo de documento del proveedor (NIT, CC, CE, TI, PP, …). Acompaña a tax_id para saber
-- si el número es un NIT de empresa o un documento de persona natural.

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN "document_type" VARCHAR(10);
