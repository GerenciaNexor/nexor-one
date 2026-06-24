-- ============================================================================
-- HU-124 — Cliente favorito + descuento manual (ARI)
--
-- Columnas aditivas sobre clients (no destructivo):
--   is_favorite     → marca de cliente favorito (default false)
--   discount_type   → 'percent' (0-100) | 'amount' (monto fijo) | NULL
--   discount_value  → valor del descuento (NULL si no hay)
--
-- El descuento es informativo/manual: NO dispara envíos automáticos (fuera de alcance).
-- clients ya tiene RLS (cubre las nuevas columnas) — sin alta nueva en setup-rls.ts.
-- ============================================================================

ALTER TABLE "clients" ADD COLUMN "is_favorite"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "clients" ADD COLUMN "discount_type"  VARCHAR(10);
ALTER TABLE "clients" ADD COLUMN "discount_value" DECIMAL(15,2);

CREATE INDEX "clients_tenant_id_is_favorite_idx" ON "clients"("tenant_id", "is_favorite");
