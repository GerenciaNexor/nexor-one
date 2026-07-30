-- HU-157 — Estado del recordatorio (pendiente/hecho) para la regla de finalización antes de eliminar.
-- Cambio menor sobre la tabla de HU-156: no toca RLS ni el modelo de disparo (job).

ALTER TABLE "reminders"
  ADD COLUMN IF NOT EXISTS "status"       VARCHAR(20)  NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMPTZ(6);

-- Índice para listar rápido "pendientes del usuario".
CREATE INDEX IF NOT EXISTS "reminders_tenant_user_status_idx"
  ON "reminders" ("tenant_id", "user_id", "status");
