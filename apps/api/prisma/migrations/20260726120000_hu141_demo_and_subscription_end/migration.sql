-- ============================================================================
-- HU-141 — Habilitador: campos de fecha/estado para demo + anti-duplicado.
--
-- AUDITORÍA PREVIA (no se duplican columnas):
--   tenants        → YA existen: created_at, is_active, tax_id (NIT), updated_at.
--                    FALTAN:     is_demo, demo_started_at, demo_ended_at.
--   subscriptions  → YA existen: status, started_at, cancelled_at (HU-138).
--                    FALTA:      ends_at (fin de periodo contratado, distinto de cancelled_at).
--
-- Esta migración crea SOLO lo faltante. RLS: `tenants` es la tabla raíz (sin tenant_id → sin
-- política RLS) y `subscriptions` ya es deny-all de plataforma (solo directPrisma) — por eso NO
-- se toca setup-rls.ts. El índice sobre tax_id soporta la búsqueda del anti-duplicado por NIT.
--
-- ANTI-DUPLICADO (regla documentada, la aplica un HU posterior de flujo de demo):
--   Una empresa NO recibe una segunda demo si ya existe un tenant (nunca se borra) con el mismo
--   NIT (`tax_id` normalizado) o el mismo correo del admin, y ese tenant cumple alguna de:
--     · is_demo = true            → ya tuvo demo (aunque demo_ended_at esté en el pasado
--                                    = expirada, o aunque se haya convertido en cliente), o
--     · tiene fila en subscriptions → ya fue/es cliente.
--   Una demo vencida se marca expirada/consumida por `demo_ended_at <= now()`; el rastro
--   (is_demo = true) es PERMANENTE y no se borra.
-- ============================================================================

-- tenants: flag de demo permanente + ventana de demo (inicio/fin)
ALTER TABLE "tenants"
  ADD COLUMN "is_demo"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "demo_started_at" TIMESTAMPTZ(6),
  ADD COLUMN "demo_ended_at"   TIMESTAMPTZ(6);

-- subscriptions: fecha de fin de suscripción (fin de periodo contratado)
ALTER TABLE "subscriptions"
  ADD COLUMN "ends_at" TIMESTAMPTZ(6);

-- Índice de apoyo al anti-duplicado (búsqueda por NIT/documento estable)
CREATE INDEX "tenants_tax_id_idx" ON "tenants"("tax_id");
