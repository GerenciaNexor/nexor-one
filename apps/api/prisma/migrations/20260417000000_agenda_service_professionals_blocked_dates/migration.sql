-- HU-067: Agenda — profesionales por servicio y fechas bloqueadas
-- Cambios:
--   1. Agrega columna description a service_types
--   2. Crea tabla service_professionals (ServiceType ↔ User)
--   3. Crea tabla blocked_dates (festivos/cierres por sucursal)
--   4. Agrega índice por isActive en service_types

-- 1. description en service_types
ALTER TABLE "service_types" ADD COLUMN "description" VARCHAR(500);

-- 2. service_professionals
CREATE TABLE "service_professionals" (
    "service_type_id" VARCHAR(30) NOT NULL,
    "user_id"         VARCHAR(30) NOT NULL,

    CONSTRAINT "service_professionals_pkey" PRIMARY KEY ("service_type_id","user_id")
);

CREATE INDEX "service_professionals_user_id_idx" ON "service_professionals"("user_id");

ALTER TABLE "service_professionals"
    ADD CONSTRAINT "service_professionals_service_type_id_fkey"
        FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_professionals"
    ADD CONSTRAINT "service_professionals_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. blocked_dates
CREATE TABLE "blocked_dates" (
    "id"         VARCHAR(30)  NOT NULL,
    "tenant_id"  VARCHAR(30)  NOT NULL,
    "branch_id"  VARCHAR(30),
    "date"       DATE         NOT NULL,
    "reason"     VARCHAR(255),

    CONSTRAINT "blocked_dates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blocked_dates_tenant_id_branch_id_date_key"
    ON "blocked_dates"("tenant_id", "branch_id", "date");

CREATE INDEX "blocked_dates_tenant_id_date_idx"
    ON "blocked_dates"("tenant_id", "date");

ALTER TABLE "blocked_dates"
    ADD CONSTRAINT "blocked_dates_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "blocked_dates"
    ADD CONSTRAINT "blocked_dates_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Índice isActive en service_types
CREATE INDEX "service_types_tenant_id_is_active_idx"
    ON "service_types"("tenant_id", "is_active");
