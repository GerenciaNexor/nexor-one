-- HU-136 — Registro INMUTABLE (append-only) de acciones administrativas de la plataforma.
-- Sin FKs a propósito (la historia sobrevive a borrados y no cascada).
-- La RLS deny-all para nexor_app NO va aquí: se aplica en db:rls (setup-rls.ts).

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" VARCHAR(30) NOT NULL,
    "platform_admin_id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30),
    "action" VARCHAR(60) NOT NULL,
    "reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_audit_logs_created_at_idx" ON "platform_audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "platform_audit_logs_tenant_id_created_at_idx" ON "platform_audit_logs"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "platform_audit_logs_platform_admin_id_idx" ON "platform_audit_logs"("platform_admin_id");
