-- HU-044: supplierId nullable en purchase_orders
-- Permite crear borradores automáticos sin proveedor asignado cuando
-- no hay historial de compras para el producto afectado.
ALTER TABLE "purchase_orders" ALTER COLUMN "supplier_id" DROP NOT NULL;
