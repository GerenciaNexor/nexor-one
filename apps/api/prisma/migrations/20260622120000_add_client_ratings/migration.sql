-- ============================================================================
-- HU-126 — Calificación interna del equipo de ventas al cliente, al cerrar la venta
--
-- Disparador (decisión PO): deal en etapa GANADA (isFinalWon). Escala 1-5. Una por deal.
-- NO es el CSAT del cliente hacia la empresa (encuesta saliente, va aparte).
-- RLS por tenant_id (alta en setup-rls.ts). Migración real (no db push).
-- ============================================================================

CREATE TABLE "client_ratings" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "client_id" VARCHAR(30) NOT NULL,
    "deal_id" VARCHAR(30),
    "rating" SMALLINT NOT NULL,
    "notes" TEXT,
    "rated_by" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_ratings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_ratings_deal_id_key" ON "client_ratings"("deal_id");
CREATE INDEX "client_ratings_tenant_id_client_id_idx" ON "client_ratings"("tenant_id", "client_id");
CREATE INDEX "client_ratings_created_at_idx" ON "client_ratings"("created_at" DESC);

ALTER TABLE "client_ratings" ADD CONSTRAINT "client_ratings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_ratings" ADD CONSTRAINT "client_ratings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_ratings" ADD CONSTRAINT "client_ratings_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_ratings" ADD CONSTRAINT "client_ratings_rated_by_fkey" FOREIGN KEY ("rated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
