-- ============================================================================
-- HU-127 — Rollup diario del Dashboard (gráficos de líneas)
--
-- Una fila por (tenant, sucursal, día). branch_id NULL = consolidado del tenant.
-- Poblada por un job programado (delete+insert por tenant/ventana → sin UNIQUE).
-- Distinción: purchase_orders_created = OC creadas; purchases_received = OC recibidas.
-- RLS por tenant_id (alta en setup-rls.ts). Migración real (no db push).
-- ============================================================================

CREATE TABLE "dashboard_daily_rollups" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "branch_id" VARCHAR(30),
    "date" DATE NOT NULL,
    "purchases_received" INTEGER NOT NULL DEFAULT 0,
    "purchases_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "sales_count" INTEGER NOT NULL DEFAULT 0,
    "sales_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "purchase_orders_created" INTEGER NOT NULL DEFAULT 0,
    "quotes_created" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_daily_rollups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dashboard_daily_rollups_tenant_id_date_idx" ON "dashboard_daily_rollups"("tenant_id", "date");
CREATE INDEX "dashboard_daily_rollups_tenant_id_branch_id_date_idx" ON "dashboard_daily_rollups"("tenant_id", "branch_id", "date");

ALTER TABLE "dashboard_daily_rollups" ADD CONSTRAINT "dashboard_daily_rollups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dashboard_daily_rollups" ADD CONSTRAINT "dashboard_daily_rollups_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
