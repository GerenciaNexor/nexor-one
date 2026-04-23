-- CreateTable: monthly_budgets
CREATE TABLE "monthly_budgets" (
    "id"         VARCHAR(30)    NOT NULL,
    "tenant_id"  VARCHAR(30)    NOT NULL,
    "branch_id"  VARCHAR(30),
    "year"       INTEGER        NOT NULL,
    "month"      INTEGER        NOT NULL,
    "amount"     DECIMAL(15,2)  NOT NULL,
    "currency"   VARCHAR(3)     NOT NULL DEFAULT 'COP',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_budgets_pkey" PRIMARY KEY ("id")
);

-- Unique: un presupuesto por tenant/sucursal/año/mes
CREATE UNIQUE INDEX "monthly_budgets_tenant_id_branch_id_year_month_key"
    ON "monthly_budgets"("tenant_id", "branch_id", "year", "month");

CREATE INDEX "monthly_budgets_tenant_id_idx"
    ON "monthly_budgets"("tenant_id");

-- ForeignKeys
ALTER TABLE "monthly_budgets"
    ADD CONSTRAINT "monthly_budgets_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "monthly_budgets"
    ADD CONSTRAINT "monthly_budgets_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
