-- ============================================================================
-- HU-154 — Contraparte genérica ÚNICA por tenant.
--   clients.is_generic   → "Consumidor final" (ventas)
--   suppliers.is_generic → "Proveedor ocasional" (compras)
--
-- Regla dura de aislamiento: el genérico es un registro REAL del tenant (con tenant_id),
-- sujeto al RLS existente de clients/suppliers — jamás un genérico global compartido. El índice
-- único PARCIAL garantiza como máximo UN genérico por empresa (idempotencia a nivel de BD).
-- ============================================================================

ALTER TABLE "clients"   ADD COLUMN "is_generic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "suppliers" ADD COLUMN "is_generic" BOOLEAN NOT NULL DEFAULT false;

-- Máximo un genérico por tenant (defensa a nivel de BD contra duplicados/carreras).
CREATE UNIQUE INDEX "clients_tenant_generic_unique"
  ON "clients" ("tenant_id") WHERE "is_generic" = true;
CREATE UNIQUE INDEX "suppliers_tenant_generic_unique"
  ON "suppliers" ("tenant_id") WHERE "is_generic" = true;
