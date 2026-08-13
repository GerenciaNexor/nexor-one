-- HU-196 — Configuración del comportamiento del agente de IA por sucursal (branch_id) o del tenant
-- completo (branch_id NULL = default). settings JSONB extensible (canales, responder/notificar,
-- agendar por canal, horario). Un solo default por tenant se garantiza en el servicio (upsert).

-- CreateTable
CREATE TABLE "agent_settings" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "branch_id" VARCHAR(30),
    "settings" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_settings_tenant_id_branch_id_key" ON "agent_settings"("tenant_id", "branch_id");

-- AddForeignKey
ALTER TABLE "agent_settings" ADD CONSTRAINT "agent_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
