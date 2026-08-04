-- HU-175 — Alquiler entrante (de un tercero). El producto NO entra a KIRA; es un registro
-- aparte de "lo prestado". Tercero = proveedor existente (supplier_id) o entidad suelta
-- (third_party_name + third_party_contact). RLS se aplica en setup-rls.ts (incoming_rentals).

-- CreateTable
CREATE TABLE "incoming_rentals" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "branch_id" VARCHAR(30),
    "user_id" VARCHAR(30),
    "supplier_id" VARCHAR(30),
    "third_party_name" VARCHAR(255),
    "third_party_contact" VARCHAR(255),
    "description" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "project" VARCHAR(255) NOT NULL,
    "return_date" DATE NOT NULL,
    "rental_cost" DECIMAL(15,2) NOT NULL,
    "deposit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "returned_at" TIMESTAMPTZ(6),
    "returned_by" VARCHAR(30),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "incoming_rentals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incoming_rentals_tenant_id_status_idx" ON "incoming_rentals"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "incoming_rentals_tenant_id_supplier_id_idx" ON "incoming_rentals"("tenant_id", "supplier_id");

-- CreateIndex
CREATE INDEX "incoming_rentals_supplier_id_idx" ON "incoming_rentals"("supplier_id");

-- AddForeignKey
ALTER TABLE "incoming_rentals" ADD CONSTRAINT "incoming_rentals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_rentals" ADD CONSTRAINT "incoming_rentals_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_rentals" ADD CONSTRAINT "incoming_rentals_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_rentals" ADD CONSTRAINT "incoming_rentals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_rentals" ADD CONSTRAINT "incoming_rentals_returned_by_fkey" FOREIGN KEY ("returned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
