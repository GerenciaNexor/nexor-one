-- ============================================================================
-- HU-158 — Habilitador de alquiler: producto alquilable + stock disponible vs total.
--
-- 1) products: flags de venta/alquiler + tarifa de alquiler.
-- 2) stocks:   rented_quantity → disponible = quantity − rented_quantity.
--              El alquiler NO reduce el total; reduce el disponible.
-- 3) rentals:  tabla nueva (salida temporal de stock), fuente de verdad del alquilado,
--              con RLS por tenant. Base del módulo de alquiler (HU-159–163).
--
-- Trazabilidad HU-128 intacta: stock_movements permanece append-only y sin cambios.
-- ============================================================================

-- 1) Producto: venta / alquiler / ambos ---------------------------------------
ALTER TABLE "products"
  ADD COLUMN "is_sellable"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "is_rentable"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "rental_price" DECIMAL(15, 2);

-- 2) Stock: unidades alquiladas actualmente (disponible = quantity − rented_quantity)
ALTER TABLE "stocks"
  ADD COLUMN "rented_quantity" DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- Invariantes de stock (defensa en profundidad, además de la validación de servicio):
--   - alquilado nunca negativo
--   - disponible nunca negativo  ⇔  alquilado ≤ total
ALTER TABLE "stocks"
  ADD CONSTRAINT "stocks_rented_nonneg_chk"   CHECK ("rented_quantity" >= 0),
  ADD CONSTRAINT "stocks_rented_le_total_chk" CHECK ("rented_quantity" <= "quantity");

-- 3) Tabla de alquileres -------------------------------------------------------
CREATE TABLE "rentals" (
  "id"          VARCHAR(30)    NOT NULL,
  "tenant_id"   VARCHAR(30)    NOT NULL,
  "product_id"  VARCHAR(30)    NOT NULL,
  "branch_id"   VARCHAR(30)    NOT NULL,
  "client_id"   VARCHAR(30),
  "user_id"     VARCHAR(30),
  "quantity"    DECIMAL(10, 2) NOT NULL,
  "status"      VARCHAR(20)    NOT NULL DEFAULT 'active',
  "rented_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "due_at"      TIMESTAMPTZ(6),
  "returned_at" TIMESTAMPTZ(6),
  "notes"       TEXT,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "rentals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rentals_quantity_pos_chk" CHECK ("quantity" > 0)
);

CREATE INDEX "rentals_tenant_product_branch_status_idx" ON "rentals" ("tenant_id", "product_id", "branch_id", "status");
CREATE INDEX "rentals_tenant_status_idx"                ON "rentals" ("tenant_id", "status");
CREATE INDEX "rentals_client_id_idx"                    ON "rentals" ("client_id");

ALTER TABLE "rentals"
  ADD CONSTRAINT "rentals_tenant_id_fkey"  FOREIGN KEY ("tenant_id")  REFERENCES "tenants"("id")  ON DELETE CASCADE  ON UPDATE CASCADE,
  ADD CONSTRAINT "rentals_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rentals_branch_id_fkey"  FOREIGN KEY ("branch_id")  REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rentals_client_id_fkey"  FOREIGN KEY ("client_id")  REFERENCES "clients"("id")  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "rentals_user_id_fkey"    FOREIGN KEY ("user_id")    REFERENCES "users"("id")    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── RLS (mismo patrón tenant_isolation que el resto de tablas de negocio) ──
ALTER TABLE "rentals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rentals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "rentals";
CREATE POLICY tenant_isolation ON "rentals"
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));
GRANT SELECT, INSERT, UPDATE, DELETE ON "rentals" TO nexor_app;
