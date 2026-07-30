-- ============================================================================
-- HU-156 — Recordatorios universales por usuario/tenant, con RLS.
-- Tabla nueva `reminders` (sujeta a RLS como cualquier tabla de negocio: aislada por tenant_id).
-- El filtrado por usuario (cada quien ve los suyos) se hace en el servicio; RLS aísla por empresa.
-- ============================================================================

CREATE TABLE "reminders" (
  "id"            VARCHAR(30)  NOT NULL,
  "tenant_id"     VARCHAR(30)  NOT NULL,
  "user_id"       VARCHAR(30)  NOT NULL,
  "title"         VARCHAR(255) NOT NULL,
  "description"   TEXT,
  "remind_at"     TIMESTAMPTZ(6) NOT NULL,
  "alert_level"   VARCHAR(20)  NOT NULL DEFAULT 'normal',
  "recurrence"    VARCHAR(20)  NOT NULL DEFAULT 'none',
  "related_type"  VARCHAR(30),
  "related_id"    VARCHAR(30),
  "is_active"     BOOLEAN      NOT NULL DEFAULT true,
  "last_fired_at" TIMESTAMPTZ(6),
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reminders_tenant_id_user_id_idx"   ON "reminders" ("tenant_id", "user_id");
CREATE INDEX "reminders_is_active_remind_at_idx" ON "reminders" ("is_active", "remind_at");

ALTER TABLE "reminders"
  ADD CONSTRAINT "reminders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "reminders_user_id_fkey"   FOREIGN KEY ("user_id")   REFERENCES "users"("id")   ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS (mismo patrón tenant_isolation que el resto; precedente HU-114/HU-117) ──
ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reminders" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "reminders";
CREATE POLICY tenant_isolation ON "reminders"
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));
GRANT SELECT, INSERT, UPDATE, DELETE ON "reminders" TO nexor_app;
