-- HU-207 — Registro de notificaciones enviadas por WhatsApp Business (Cloud API + plantillas).
-- Trazabilidad y observabilidad de costo. El token vive cifrado en integrations; aquí solo el envío.

CREATE TABLE "whatsapp_messages" (
  "id"             VARCHAR(30)  NOT NULL,
  "tenant_id"      VARCHAR(30)  NOT NULL,
  "to_phone"       VARCHAR(20)  NOT NULL,
  "template_name"  VARCHAR(120) NOT NULL,
  "language_code"  VARCHAR(10)  NOT NULL DEFAULT 'es',
  "variables"      JSONB,
  "category"       VARCHAR(20),
  "status"         VARCHAR(20)  NOT NULL DEFAULT 'queued',
  "message_id"     VARCHAR(160),
  "estimated_cost" DECIMAL(10,5),
  "error_code"     VARCHAR(80),
  "error_detail"   TEXT,
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "whatsapp_messages_tenant_id_created_at_idx" ON "whatsapp_messages"("tenant_id", "created_at" DESC);
CREATE INDEX "whatsapp_messages_tenant_id_status_idx" ON "whatsapp_messages"("tenant_id", "status");

ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
