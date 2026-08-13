-- HU-200 — Control presupuestario del proyecto-LÍMITE: sobregasto, aprobación y exceso con traza.
-- RLS de budget_approvals se habilita aparte en setup-rls.ts (paso obligatorio tras migrar).

-- Proyecto: plazo del sobregasto (null → 2 días) + marca de aviso de umbral.
ALTER TABLE "proyectos" ADD COLUMN "overspend_grace_days" INTEGER;
ALTER TABLE "proyectos" ADD COLUMN "alert_notified_at" TIMESTAMPTZ(6);

-- Transaction: estado de la asignación al proyecto (la del gasto en VERA no cambia).
ALTER TABLE "transactions" ADD COLUMN "assignment_status" VARCHAR(20);
-- Backfill: las asignaciones existentes (HU-199) cuentan como 'assigned' (dentro del tope).
UPDATE "transactions" SET "assignment_status" = 'assigned' WHERE "project_id" IS NOT NULL;

-- Solicitudes de sobregasto (una por asignación controlada). trace append-only.
CREATE TABLE "budget_approvals" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "project_id" VARCHAR(30) NOT NULL,
    "transaction_id" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "requested_by" VARCHAR(30),
    "resolved_by" VARCHAR(30),
    "resolved_at" TIMESTAMPTZ(6),
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "trace" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "budget_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "budget_approvals_transaction_id_key" ON "budget_approvals"("transaction_id");
CREATE INDEX "budget_approvals_tenant_id_status_idx" ON "budget_approvals"("tenant_id", "status");
CREATE INDEX "budget_approvals_status_due_at_idx" ON "budget_approvals"("status", "due_at");

ALTER TABLE "budget_approvals" ADD CONSTRAINT "budget_approvals_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_approvals" ADD CONSTRAINT "budget_approvals_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_approvals" ADD CONSTRAINT "budget_approvals_transaction_id_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
