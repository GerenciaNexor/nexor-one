-- HU-198 — Base del módulo de Proyectos: metas (objetivo) y presupuestos (límite) por tenant.
-- La RLS (tenant_isolation) se habilita aparte en setup-rls.ts (paso obligatorio tras migrar).
CREATE TABLE "proyectos" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" VARCHAR(20) NOT NULL,
    "target_amount" DECIMAL(15,2) NOT NULL,
    "alert_amount" DECIMAL(15,2),
    "alert_pct" INTEGER,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'activo',
    "created_by" VARCHAR(30),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "proyectos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proyectos_tenant_id_status_idx" ON "proyectos"("tenant_id", "status");

ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
