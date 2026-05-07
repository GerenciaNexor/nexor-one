-- ============================================================================
-- Migración: conversations + conversation_messages — HU-104
--
-- Crea el modelo de datos de la bandeja de entrada:
--   1. conversations      — hilo agrupado por canal + remitente + ventana temporal
--   2. conversation_messages — mensajes individuales, APPEND-ONLY
--
-- Reglas de negocio implementadas en el worker (no en DDL):
--   - WhatsApp: ventana de 24 h de inactividad para abrir nueva conversación.
--   - Gmail:    sin ventana de tiempo — agrupa por email del remitente.
--   - El estado lo actualiza el equipo humano; el agente nunca cambia status.
-- ============================================================================

-- ─── 1. Tabla conversations ───────────────────────────────────────────────────

CREATE TABLE "conversations" (
    "id"                VARCHAR(30)    NOT NULL,
    "tenant_id"         VARCHAR(30)    NOT NULL,
    "channel"           "Channel"      NOT NULL,
    "sender_identifier" VARCHAR(255)   NOT NULL,
    "sender_name"       VARCHAR(255),
    "related_module"    "ModuleName",
    -- open | replied | resolved | reassigned
    "status"            VARCHAR(20)    NOT NULL DEFAULT 'open',
    "assigned_to"       VARCHAR(30),
    "last_message_at"   TIMESTAMPTZ(6) NOT NULL,
    "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- ─── 2. Tabla conversation_messages ──────────────────────────────────────────

CREATE TABLE "conversation_messages" (
    "id"                  VARCHAR(30)    NOT NULL,
    "conversation_id"     VARCHAR(30)    NOT NULL,
    "tenant_id"           VARCHAR(30)    NOT NULL,
    -- inbound | outbound
    "direction"           VARCHAR(10)    NOT NULL,
    "content"             TEXT           NOT NULL,
    -- text | image | document
    "message_type"        VARCHAR(20)    NOT NULL DEFAULT 'text',
    "is_from_agent"       BOOLEAN        NOT NULL DEFAULT false,
    "user_id"             VARCHAR(30),
    -- wamid de Meta o messageId de Gmail — para deduplicación
    "external_message_id" VARCHAR(255),
    "timestamp"           TIMESTAMPTZ(6) NOT NULL,
    "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- ─── 3. Foreign keys ─────────────────────────────────────────────────────────

ALTER TABLE "conversations"
    ADD CONSTRAINT "conversations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversations"
    ADD CONSTRAINT "conversations_assigned_to_fkey"
    FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "conversation_messages"
    ADD CONSTRAINT "conversation_messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation_messages"
    ADD CONSTRAINT "conversation_messages_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation_messages"
    ADD CONSTRAINT "conversation_messages_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 4. CHECK constraints ────────────────────────────────────────────────────

ALTER TABLE "conversations"
    ADD CONSTRAINT "conversations_status_check"
    CHECK (status IN ('open', 'replied', 'resolved', 'reassigned'));

ALTER TABLE "conversation_messages"
    ADD CONSTRAINT "conversation_messages_direction_check"
    CHECK (direction IN ('inbound', 'outbound'));

ALTER TABLE "conversation_messages"
    ADD CONSTRAINT "conversation_messages_type_check"
    CHECK (message_type IN ('text', 'image', 'document'));

-- ─── 5. Índices ───────────────────────────────────────────────────────────────

-- Búsqueda de conversaciones activas por canal + remitente (FindOrCreate en el worker)
CREATE INDEX "conversations_tenant_id_channel_sender_identifier_idx"
    ON "conversations" ("tenant_id", "channel", "sender_identifier");

-- Filtro por estado para la bandeja de entrada
CREATE INDEX "conversations_tenant_id_status_idx"
    ON "conversations" ("tenant_id", "status");

-- Ordenar bandeja por actividad reciente + cálculo de ventana de 24 h
CREATE INDEX "conversations_last_message_at_idx"
    ON "conversations" ("last_message_at" DESC);

-- Hilo cronológico de una conversación
CREATE INDEX "conversation_messages_conversation_id_timestamp_idx"
    ON "conversation_messages" ("conversation_id", "timestamp" ASC);

-- Aislamiento RLS + queries analíticas por tenant
CREATE INDEX "conversation_messages_tenant_id_idx"
    ON "conversation_messages" ("tenant_id");

-- Deduplicación por ID externo (wamid / Gmail messageId)
CREATE INDEX "conversation_messages_external_message_id_idx"
    ON "conversation_messages" ("external_message_id")
    WHERE "external_message_id" IS NOT NULL;

-- ─── 6. RLS — conversations ───────────────────────────────────────────────────
--
-- Patrón idéntico al del resto de tablas de negocio.
-- La variable app.current_tenant_id la inyecta el tenantHook de Fastify.

ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "conversations";
CREATE POLICY tenant_isolation ON "conversations"
    USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
    WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

-- ─── 7. RLS — conversation_messages ──────────────────────────────────────────

ALTER TABLE "conversation_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversation_messages" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "conversation_messages";
CREATE POLICY tenant_isolation ON "conversation_messages"
    USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
    WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

-- ─── 8. Privilegios para el rol de aplicación ────────────────────────────────
--
-- conversations: SELECT, INSERT, UPDATE (el equipo actualiza el status)
-- conversation_messages: SELECT, INSERT (append-only — nunca se edita ni elimina)

GRANT SELECT, INSERT, UPDATE ON "conversations"         TO nexor_app;
GRANT SELECT, INSERT         ON "conversation_messages" TO nexor_app;
