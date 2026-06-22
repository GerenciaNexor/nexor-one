-- ============================================================================
-- Migración HU-116 (Sprint 12) — Unificar la nomenclatura de estados de OC
--
-- Vocabulario CANÓNICO de purchase_orders.status:
--   draft → submitted → approved → (sent) → partial → received   |   cancelled
--
-- Resuelve los dos pares en conflicto entre código y documentación:
--   pending_approval  → submitted   (coherente con el endpoint .../submit)
--   delivered         → received    (coherente con el endpoint .../receive)
--
-- Renombra los estados ya persistidos (seed, demo, staging). El estado se guarda
-- como texto (VARCHAR), así que basta un UPDATE. La migración corre como superuser
-- (directUrl), por lo que actualiza las filas de todos los tenants.
-- ============================================================================

UPDATE "purchase_orders" SET "status" = 'submitted' WHERE "status" = 'pending_approval';
UPDATE "purchase_orders" SET "status" = 'received'  WHERE "status" = 'delivered';
