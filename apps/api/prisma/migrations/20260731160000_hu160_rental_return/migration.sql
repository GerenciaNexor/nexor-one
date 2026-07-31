-- ============================================================================
-- HU-160 — Devolución del alquiler y resolución del depósito.
-- Amplía `rentals` con el cierre de la devolución (trazabilidad: quién/cuánto/por qué).
-- El reflejo en VERA (depósito retenido → ingreso) lo hace el servicio, no la migración.
-- RLS sin cambios; stock_movements intacto (append-only).
-- ============================================================================

ALTER TABLE "rentals"
  ADD COLUMN "returned_by"       VARCHAR(30),
  ADD COLUMN "product_condition" VARCHAR(20),
  ADD COLUMN "deposit_retained"  DECIMAL(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "deposit_reason"    TEXT,
  ADD COLUMN "charge_total"      DECIMAL(15, 2),
  ADD COLUMN "rental_days"       INTEGER;

ALTER TABLE "rentals"
  ADD CONSTRAINT "rentals_deposit_retained_nonneg_chk" CHECK ("deposit_retained" >= 0),
  ADD CONSTRAINT "rentals_returned_by_fkey" FOREIGN KEY ("returned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
