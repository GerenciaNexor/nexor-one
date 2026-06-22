-- ============================================================================
-- HU-120 — Migración faltante: crea la tabla bulk_upload_logs.
--
-- La tabla se introdujo en su momento con `prisma db push` (sin migración), por lo
-- que existía en dev/main pero NO en un entorno desde cero. Eso hacía fallar la
-- migración de RLS de HU-114 (20260618000000_rls_inbox_bulkupload), que la asume
-- existente. Esta migración la materializa, ubicada ANTES de la de RLS.
--
-- Idempotente (CREATE ... IF NOT EXISTS + FK guardada): es no-op donde la tabla ya
-- existe (dev/main) y la crea en entornos limpios. DDL idéntico al que genera Prisma
-- desde el schema (migrate diff --from-empty).
-- ============================================================================

CREATE TABLE IF NOT EXISTS "bulk_upload_logs" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "user_id" VARCHAR(30) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "file_name" VARCHAR(500) NOT NULL,
    "file_size" INTEGER,
    "row_count" INTEGER,
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL,
    "errors" JSONB,
    "file_data" BYTEA,
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulk_upload_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "bulk_upload_logs_tenant_id_idx"        ON "bulk_upload_logs"("tenant_id");
CREATE INDEX IF NOT EXISTS "bulk_upload_logs_tenant_id_type_idx"   ON "bulk_upload_logs"("tenant_id", "type");
CREATE INDEX IF NOT EXISTS "bulk_upload_logs_tenant_id_status_idx" ON "bulk_upload_logs"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "bulk_upload_logs_created_at_idx"       ON "bulk_upload_logs"("created_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bulk_upload_logs_tenant_id_fkey') THEN
    ALTER TABLE "bulk_upload_logs" ADD CONSTRAINT "bulk_upload_logs_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
