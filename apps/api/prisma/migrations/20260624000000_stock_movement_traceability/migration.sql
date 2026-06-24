-- ============================================================================
-- HU-128 — Trazabilidad completa del inventario
--
-- 1) stock_movements gana:
--      reason            → motivo OBLIGATORIO (compra|venta|devolucion|ajuste|traslado|desconocido)
--      sale_price_frozen → precio de venta congelado (solo ventas) — margen histórico
--      cost_price_frozen → precio de costo congelado (solo ventas)
-- 2) Se normaliza `type` a minúsculas (entrada|salida|ajuste) — había ENTRADA/adjustment.
-- 3) BACKFILL de `reason` para movimientos históricos (criterio 9): se deriva de
--    reference_type/type; lo no derivable se marca 'desconocido'. Los precios congelados
--    históricos quedan NULL (no se pueden reconstruir) — documentado.
--
-- stock_movements sigue siendo append-only en operación normal; este backfill es un
-- ajuste único y controlado de migración.
-- ============================================================================

-- reason NOT NULL con DEFAULT 'desconocido' (retrocompatible: el código ya desplegado que
-- no setea reason inserta 'desconocido' en vez de fallar; el código de HU-128 pone el real).
ALTER TABLE "stock_movements" ADD COLUMN "reason"            VARCHAR(20) NOT NULL DEFAULT 'desconocido';
ALTER TABLE "stock_movements" ADD COLUMN "sale_price_frozen" DECIMAL(15,2);
ALTER TABLE "stock_movements" ADD COLUMN "cost_price_frozen" DECIMAL(15,2);

-- Normalizar type: 'adjustment' → 'ajuste', y MAYÚSCULAS → minúsculas.
UPDATE "stock_movements" SET "type" = 'ajuste'    WHERE lower("type") = 'adjustment';
UPDATE "stock_movements" SET "type" = lower("type") WHERE "type" <> lower("type");

-- Backfill de reason (motivo) a partir de la referencia/tipo (refina el default 'desconocido').
UPDATE "stock_movements" SET "reason" = 'compra' WHERE "reference_type" = 'purchase_order';
UPDATE "stock_movements" SET "reason" = 'venta'  WHERE "reference_type" IN ('deal', 'quote');
UPDATE "stock_movements" SET "reason" = 'ajuste' WHERE "reference_type" = 'bulk_upload' OR "type" = 'ajuste';
-- El resto permanece 'desconocido' (movimientos manuales históricos sin referencia).

CREATE INDEX "stock_movements_tenant_id_reason_idx" ON "stock_movements"("tenant_id", "reason");
