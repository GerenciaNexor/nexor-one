-- ============================================================================
-- Migración: chat_messages — índice compuesto, CHECK constraint y RLS
--
-- Contexto (HU-057B):
--   La tabla chat_messages ya existe (20260411131212_add_chat_messages).
--   Esta migración la completa con:
--     1. Índice compuesto (tenant_id, user_id, created_at DESC) — reemplaza
--        los dos índices separados creados en la migración anterior.
--     2. CHECK constraint en el campo role — solo 'user' o 'assistant'.
--     3. RLS tenant_isolation — mismo patrón que el resto de tablas de negocio.
-- ============================================================================

-- ─── 1. Reemplazar índices separados por el índice compuesto requerido ────────

DROP INDEX IF EXISTS "chat_messages_user_id_tenant_id_idx";
DROP INDEX IF EXISTS "chat_messages_tenant_id_created_at_idx";

CREATE INDEX "chat_messages_tenant_id_user_id_created_at_idx"
  ON "chat_messages" ("tenant_id", "user_id", "created_at" DESC);

-- ─── 2. CHECK constraint en role ─────────────────────────────────────────────

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_role_check"
  CHECK (role IN ('user', 'assistant'));

-- ─── 3. RLS — tenant_isolation ────────────────────────────────────────────────
--
-- Patrón idéntico al de agent_logs, notifications y todas las demás tablas.
-- La variable de sesión app.current_tenant_id la inyecta el tenantHook.

ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_messages" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "chat_messages";
CREATE POLICY tenant_isolation ON "chat_messages"
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

-- ─── 4. Privilegios para el rol de aplicación ─────────────────────────────────
--
-- El rol nexor_app ya existe (creado en 20260318120000_add_rls_policies).
-- Solo garantizamos acceso a la nueva tabla.

GRANT SELECT, INSERT ON "chat_messages" TO nexor_app;
