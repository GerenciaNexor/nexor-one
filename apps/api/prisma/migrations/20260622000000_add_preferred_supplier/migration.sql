-- ============================================================================
-- HU-123 — Proveedor preferido por producto + preferido global del tenant
--
-- Columnas nullable (no destructivo) con FK a suppliers (ON DELETE SET NULL):
--   products.preferred_supplier_id  → preferido por producto (a quién comprar primero)
--   tenants.default_supplier_id     → preferido global del tenant (respaldo)
--
-- Resolución de preferencia: producto → global → comportamiento actual.
-- products ya tiene RLS (cubre la nueva columna); tenants es la raíz (sin RLS).
--
-- Incluye además un índice que el schema declaraba pero faltaba en la BD
-- (conversation_messages.external_message_id) — fix de drift previo.
-- ============================================================================

ALTER TABLE "products" ADD COLUMN "preferred_supplier_id" VARCHAR(30);
ALTER TABLE "tenants"  ADD COLUMN "default_supplier_id"   VARCHAR(30);

CREATE INDEX "products_preferred_supplier_id_idx" ON "products"("preferred_supplier_id");

ALTER TABLE "products" ADD CONSTRAINT "products_preferred_supplier_id_fkey"
  FOREIGN KEY ("preferred_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_default_supplier_id_fkey"
  FOREIGN KEY ("default_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drift previo: índice declarado en el schema, ausente en la BD.
CREATE INDEX IF NOT EXISTS "conversation_messages_external_message_id_idx"
  ON "conversation_messages"("external_message_id");
