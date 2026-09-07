-- HU-205 — quién creó la cita/evento, para la visibilidad del evento libre (creador + asistentes + admins).

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "created_by" VARCHAR(30);

-- CreateIndex
CREATE INDEX "appointments_tenant_id_created_by_idx" ON "appointments"("tenant_id", "created_by");
