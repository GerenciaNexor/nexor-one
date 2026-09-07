-- HU-204 — Evento libre en AGENDA (tipo calendario general) con asistentes múltiples.
-- Extiende `appointments` para que evento libre y cita de servicio convivan, y agrega la tabla de
-- asistentes. Las citas de servicio existentes quedan intactas (type por defecto 'service').

-- AlterTable: appointments
ALTER TABLE "appointments" ADD COLUMN "type" VARCHAR(20) NOT NULL DEFAULT 'service';
ALTER TABLE "appointments" ADD COLUMN "title" VARCHAR(255);
-- Un evento libre puede no tener sucursal ni cliente → se relajan a NULL.
ALTER TABLE "appointments" ALTER COLUMN "branch_id" DROP NOT NULL;
ALTER TABLE "appointments" ALTER COLUMN "client_name" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "appointments_tenant_id_type_start_at_idx" ON "appointments"("tenant_id", "type", "start_at");

-- CreateTable: appointment_attendees
CREATE TABLE "appointment_attendees" (
  "id"             VARCHAR(30)  NOT NULL,
  "tenant_id"      VARCHAR(30)  NOT NULL,
  "appointment_id" VARCHAR(30)  NOT NULL,
  "user_id"        VARCHAR(30),
  "email"          VARCHAR(255),
  "name"           VARCHAR(255),
  "response"       VARCHAR(20)  NOT NULL DEFAULT 'pending',
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointment_attendees_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "appointment_attendees_tenant_id_appointment_id_idx" ON "appointment_attendees"("tenant_id", "appointment_id");
CREATE INDEX "appointment_attendees_tenant_id_user_id_idx" ON "appointment_attendees"("tenant_id", "user_id");

ALTER TABLE "appointment_attendees" ADD CONSTRAINT "appointment_attendees_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment_attendees" ADD CONSTRAINT "appointment_attendees_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment_attendees" ADD CONSTRAINT "appointment_attendees_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
