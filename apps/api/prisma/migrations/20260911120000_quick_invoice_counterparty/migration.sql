-- HU-210 — Guardar el proveedor/cliente REGISTRADO de la factura, además del emisor leído.
-- (En Colombia un mismo NIT puede facturar bajo un nombre comercial distinto: proveedor ≠ emisor.)
ALTER TABLE "quick_invoices" ADD COLUMN "supplier_id" VARCHAR(30);
ALTER TABLE "quick_invoices" ADD COLUMN "client_id"   VARCHAR(30);
