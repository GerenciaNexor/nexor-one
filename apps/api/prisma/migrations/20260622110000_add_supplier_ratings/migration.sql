-- ============================================================================
-- HU-125 — Calificación manual del proveedor al recibir la OC
--
-- 1) supplier_scores: los ejes pasan a NULLABLE. NULL = "sin datos" (no engañoso)
--    en vez de un valor por defecto (0 / 10 fijo). Se agrega ratings_count.
--      price_score    → objetivo, del histórico de precios (NULL si no hay compras)
--      delivery_score → de las calificaciones manuales (NULL si no hay calificaciones)
--      quality_score  → de las calificaciones manuales (NULL si no hay calificaciones)
--      overall_score  → promedio de los ejes CON datos (NULL si ninguno tiene datos)
--
-- 2) supplier_ratings: calificación 1-5 de Entrega y Calidad por OC recibida.
--    Una por OC (purchase_order_id único). Calificar es opcional. RLS por tenant_id
--    (se da de alta en setup-rls.ts).
-- ============================================================================

ALTER TABLE "supplier_scores" ADD COLUMN "ratings_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "supplier_scores" ALTER COLUMN "price_score"    DROP NOT NULL, ALTER COLUMN "price_score"    DROP DEFAULT;
ALTER TABLE "supplier_scores" ALTER COLUMN "delivery_score" DROP NOT NULL, ALTER COLUMN "delivery_score" DROP DEFAULT;
ALTER TABLE "supplier_scores" ALTER COLUMN "quality_score"  DROP NOT NULL, ALTER COLUMN "quality_score"  DROP DEFAULT;
ALTER TABLE "supplier_scores" ALTER COLUMN "overall_score"  DROP NOT NULL, ALTER COLUMN "overall_score"  DROP DEFAULT;

CREATE TABLE "supplier_ratings" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "supplier_id" VARCHAR(30) NOT NULL,
    "purchase_order_id" VARCHAR(30),
    "delivery_rating" SMALLINT NOT NULL,
    "quality_rating" SMALLINT NOT NULL,
    "notes" TEXT,
    "rated_by" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_ratings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_ratings_purchase_order_id_key" ON "supplier_ratings"("purchase_order_id");
CREATE INDEX "supplier_ratings_tenant_id_supplier_id_idx" ON "supplier_ratings"("tenant_id", "supplier_id");
CREATE INDEX "supplier_ratings_created_at_idx" ON "supplier_ratings"("created_at" DESC);

ALTER TABLE "supplier_ratings" ADD CONSTRAINT "supplier_ratings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_ratings" ADD CONSTRAINT "supplier_ratings_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_ratings" ADD CONSTRAINT "supplier_ratings_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_ratings" ADD CONSTRAINT "supplier_ratings_rated_by_fkey" FOREIGN KEY ("rated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
