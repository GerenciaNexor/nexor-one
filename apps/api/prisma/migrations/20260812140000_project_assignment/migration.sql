-- HU-199 — Asignación manual de transacciones a proyectos + alquiler entrante con vínculo real.
-- Ninguna tabla nueva: `transactions` e `incoming_rentals` ya tienen RLS (heredan la política de la
-- tabla). SetNull: borrar un proyecto desasigna, nunca borra la transacción/alquiler.

-- transactions.project_id (asignación opcional a un proyecto del mismo tenant)
ALTER TABLE "transactions" ADD COLUMN "project_id" VARCHAR(30);
CREATE INDEX "transactions_tenant_id_project_id_idx" ON "transactions"("tenant_id", "project_id");
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- incoming_rentals: el campo `project` (texto) deja de ser obligatorio y se añade el vínculo real.
ALTER TABLE "incoming_rentals" ALTER COLUMN "project" DROP NOT NULL;
ALTER TABLE "incoming_rentals" ADD COLUMN "project_id" VARCHAR(30);
CREATE INDEX "incoming_rentals_tenant_id_project_id_idx" ON "incoming_rentals"("tenant_id", "project_id");
ALTER TABLE "incoming_rentals" ADD CONSTRAINT "incoming_rentals_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
