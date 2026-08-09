-- HU — Notificaciones de estado del canal WhatsApp (token) en la consola SUPER_ADMIN.
-- Estado de salud del canal en integrations + bandeja de notificaciones de plataforma.

-- AlterTable: estado de salud del canal
ALTER TABLE "integrations" ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE "integrations" ADD COLUMN "last_error" TEXT;
ALTER TABLE "integrations" ADD COLUMN "last_error_at" TIMESTAMPTZ(6);
ALTER TABLE "integrations" ADD COLUMN "token_expires_at" TIMESTAMPTZ(6);

-- Backfill: reflejar el estado actual (activas = conectadas).
UPDATE "integrations" SET "status" = CASE WHEN "is_active" THEN 'connected' ELSE 'pending' END;

-- CreateTable: bandeja de notificaciones de PLATAFORMA (SUPER_ADMIN). RLS deny-all en setup-rls.ts.
CREATE TABLE "platform_notifications" (
    "id" VARCHAR(30) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "tenant_id" VARCHAR(30),
    "link" VARCHAR(500),
    "metadata" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_notifications_is_read_created_at_idx" ON "platform_notifications"("is_read", "created_at" DESC);

-- CreateIndex
CREATE INDEX "platform_notifications_type_tenant_id_is_read_idx" ON "platform_notifications"("type", "tenant_id", "is_read");
