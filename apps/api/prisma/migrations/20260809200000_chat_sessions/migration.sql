-- HU-183 — Múltiples chats en "Chat AI": cada usuario puede tener varias sesiones separadas.

-- 1) Tabla de sesiones de chat.
CREATE TABLE "chat_sessions" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "user_id" VARCHAR(30) NOT NULL,
    "title" VARCHAR(255) NOT NULL DEFAULT 'Nuevo chat',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_sessions_tenant_id_user_id_updated_at_idx"
    ON "chat_sessions"("tenant_id", "user_id", "updated_at" DESC);

ALTER TABLE "chat_sessions"
    ADD CONSTRAINT "chat_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_sessions"
    ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Columna chat_session_id en chat_messages (nullable temporalmente para el backfill).
ALTER TABLE "chat_messages" ADD COLUMN "chat_session_id" VARCHAR(30);

-- 3) Backfill: una sesión "General" por (tenant, usuario) con mensajes existentes, y asignar
--    todos sus mensajes a esa sesión. Los ids son cuid-like (25 chars) generados por md5+random.
WITH pairs AS (
    SELECT "tenant_id", "user_id", min("created_at") AS first_at
    FROM "chat_messages"
    GROUP BY "tenant_id", "user_id"
),
new_sessions AS (
    INSERT INTO "chat_sessions" ("id", "tenant_id", "user_id", "title", "created_at", "updated_at")
    SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || "tenant_id" || "user_id"), 1, 24),
           "tenant_id", "user_id", 'General', first_at, now()
    FROM pairs
    RETURNING "id", "tenant_id", "user_id"
)
UPDATE "chat_messages" m
SET "chat_session_id" = s."id"
FROM new_sessions s
WHERE m."tenant_id" = s."tenant_id" AND m."user_id" = s."user_id";

-- 4) Ya sin nulos → NOT NULL + FK + índice cronológico por sesión.
ALTER TABLE "chat_messages" ALTER COLUMN "chat_session_id" SET NOT NULL;

ALTER TABLE "chat_messages"
    ADD CONSTRAINT "chat_messages_chat_session_id_fkey" FOREIGN KEY ("chat_session_id")
    REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "chat_messages_chat_session_id_created_at_idx"
    ON "chat_messages"("chat_session_id", "created_at");
