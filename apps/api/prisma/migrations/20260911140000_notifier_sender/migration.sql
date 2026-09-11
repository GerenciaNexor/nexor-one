-- HU-210 — Remitente notificador de WhatsApp (global de plataforma; a futuro uno por tenant).
CREATE TABLE "notifier_senders" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30),
    "phone_number_id" VARCHAR(50) NOT NULL,
    "waba_id" VARCHAR(50),
    "token_encrypted" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "notifier_senders_pkey" PRIMARY KEY ("id")
);

-- Un remitente por tenant; en Postgres un índice único permite varios NULL, así que el registro
-- GLOBAL (tenant_id NULL) se mantiene único a nivel de aplicación (upsert por tenant_id IS NULL).
CREATE UNIQUE INDEX "notifier_senders_tenant_id_key" ON "notifier_senders"("tenant_id");
