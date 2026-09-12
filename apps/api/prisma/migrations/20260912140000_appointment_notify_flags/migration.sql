-- HU-211 — Avisos internos de la cita (faltando 5 min y a la hora exacta), una sola vez cada uno.
ALTER TABLE "appointments" ADD COLUMN "notified_5min_at"  TIMESTAMPTZ(6);
ALTER TABLE "appointments" ADD COLUMN "notified_start_at" TIMESTAMPTZ(6);
