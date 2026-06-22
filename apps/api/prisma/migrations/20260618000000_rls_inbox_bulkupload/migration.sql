-- ============================================================================
-- Migración HU-114 (Sprint 12) — Cerrar la cobertura RLS de bandeja y carga masiva
--
-- Habilita Row-Level Security + política tenant_isolation en las 3 tablas que
-- hasta ahora solo se aislaban por el filtrado por tenant_id en los servicios:
--   - conversations
--   - conversation_messages   (tabla "hija" pero con su PROPIA columna tenant_id)
--   - bulk_upload_logs
--
-- Mismo patrón que chat_messages (20260411131542_chat_messages_rls_and_index) y
-- el resto de tablas de negocio. La variable de sesión app.current_tenant_id la
-- inyecta el tenantHook de Fastify; las escrituras fuera de una request (worker
-- de ingesta) usan directPrisma / withTenantContext.
--
-- RLS es una capa ADICIONAL de defensa: no reemplaza el filtrado por tenant_id.
-- ============================================================================

-- ─── conversations ───────────────────────────────────────────────────────────
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "conversations";
CREATE POLICY tenant_isolation ON "conversations"
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

-- ─── conversation_messages ───────────────────────────────────────────────────
ALTER TABLE "conversation_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversation_messages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "conversation_messages";
CREATE POLICY tenant_isolation ON "conversation_messages"
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

-- ─── bulk_upload_logs ─────────────────────────────────────────────────────────
ALTER TABLE "bulk_upload_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bulk_upload_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "bulk_upload_logs";
CREATE POLICY tenant_isolation ON "bulk_upload_logs"
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

-- ─── Privilegios para el rol de aplicación nexor_app ──────────────────────────
-- Guardado en un DO block para no fallar si el rol no existe (p. ej. entornos de
-- desarrollo donde la app se conecta como superusuario).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexor_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "conversations"         TO nexor_app;
    GRANT SELECT, INSERT         ON "conversation_messages" TO nexor_app;
    GRANT SELECT, INSERT         ON "bulk_upload_logs"      TO nexor_app;
  END IF;
END $$;
