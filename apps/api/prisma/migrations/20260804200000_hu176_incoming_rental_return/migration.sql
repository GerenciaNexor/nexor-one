-- HU-176 — Devolución del alquiler entrante: resolución del depósito PROPIO.
-- deposit_lost = parte del depósito que el tercero retuvo (se pierde → egreso VERA).
-- Recuperado = deposit − deposit_lost. deposit_reason = motivo si se pierde algo.

-- AlterTable
ALTER TABLE "incoming_rentals" ADD COLUMN "deposit_lost" DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE "incoming_rentals" ADD COLUMN "deposit_reason" TEXT;
