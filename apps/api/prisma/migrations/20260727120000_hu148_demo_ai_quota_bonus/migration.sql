-- ============================================================================
-- HU-148 — Cierre S16: contador de IA persistente por tenant (candado de costo).
--
-- El contador ya es confiable y persistente: se deriva de agent_logs (append-only), que no se
-- reinicia al cerrar sesión, borrar caché ni reconectar el canal. Esta migración añade SOLO la
-- capacidad de AMPLIAR el cupo de una demo concreta: `demo_ai_quota_bonus` (mensajes extra sobre
-- el base de 30). Solo el SUPER_ADMIN lo aumenta y queda auditado (tenant.demo_ai_extend).
-- Cupo efectivo = DEMO_AI_MESSAGE_QUOTA (30) + demo_ai_quota_bonus.
--
-- `tenants` es la tabla raíz (sin RLS): no se toca setup-rls.
-- ============================================================================

ALTER TABLE "tenants"
  ADD COLUMN "demo_ai_quota_bonus" INTEGER NOT NULL DEFAULT 0;
