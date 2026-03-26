-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_supplier_id_fkey";

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
