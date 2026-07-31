-- ============================================================================
-- HU-159 — Alquiler con tipo de cobro, precio y depósito.
-- Amplía `rentals` (HU-158) sin tocar RLS ni la lógica de disponible/total.
--   charge_type: fixed (monto fijo) | daily (tarifa por día)
--   fixed_amount / daily_rate: precio según el tipo de cobro
--   deposit: depósito dejado por el cliente (NO es ingreso aún — HU-162)
-- ============================================================================

ALTER TABLE "rentals"
  ADD COLUMN "charge_type"  VARCHAR(20)    NOT NULL DEFAULT 'fixed',
  ADD COLUMN "fixed_amount" DECIMAL(15, 2),
  ADD COLUMN "daily_rate"   DECIMAL(15, 2),
  ADD COLUMN "deposit"      DECIMAL(15, 2) NOT NULL DEFAULT 0;

-- Invariantes: precios y depósito no negativos.
ALTER TABLE "rentals"
  ADD CONSTRAINT "rentals_fixed_amount_nonneg_chk" CHECK ("fixed_amount" IS NULL OR "fixed_amount" >= 0),
  ADD CONSTRAINT "rentals_daily_rate_nonneg_chk"   CHECK ("daily_rate"   IS NULL OR "daily_rate"   >= 0),
  ADD CONSTRAINT "rentals_deposit_nonneg_chk"      CHECK ("deposit" >= 0);
