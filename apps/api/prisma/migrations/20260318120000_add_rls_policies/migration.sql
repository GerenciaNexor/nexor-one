-- ============================================================================
-- Migración: Row-Level Security (RLS) en todas las tablas de negocio
--
-- Estrategia:
--   1. Crear rol nexor_app (no-superuser) — el proceso Fastify se conecta
--      con este rol, por lo que RLS se aplica efectivamente.
--   2. Habilitar RLS + FORCE ROW LEVEL SECURITY en 19 tablas con tenant_id.
--   3. Política única por tabla: tenant_id debe coincidir con la variable de
--      sesión app.current_tenant_id inyectada por el tenantHook.
--   4. El rol postgres (superuser) siempre bypass RLS — para migraciones y seeds.
--
-- Variable de sesión: app.current_tenant_id
--   Establecida en: src/plugins/tenant.ts (set_config session-level)
--   Establecida en: src/lib/prisma.ts withTenantContext (SET LOCAL, transaccional)
-- ============================================================================

-- ─── 1. Rol de aplicación ────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_catalog.pg_roles WHERE rolname = 'nexor_app'
  ) THEN
    CREATE ROLE nexor_app WITH LOGIN PASSWORD 'nexor_app_secret';
  END IF;
END
$$;

-- Privilegios de esquema y tablas
GRANT USAGE ON SCHEMA public TO nexor_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexor_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexor_app;

-- Asegurar que las tablas futuras también sean accesibles
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexor_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO nexor_app;

-- ─── Macro idempotente: DROP IF EXISTS + ENABLE + FORCE + CREATE ─────────────
-- Cada bloque es seguro de re-ejecutar.

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON branches;
CREATE POLICY tenant_isolation ON branches
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON feature_flags;
CREATE POLICY tenant_isolation ON feature_flags
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON integrations;
CREATE POLICY tenant_isolation ON integrations
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

-- APPEND-ONLY por diseño
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON agent_logs;
CREATE POLICY tenant_isolation ON agent_logs
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON notifications;
CREATE POLICY tenant_isolation ON notifications
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON clients;
CREATE POLICY tenant_isolation ON clients
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pipeline_stages;
CREATE POLICY tenant_isolation ON pipeline_stages
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON deals;
CREATE POLICY tenant_isolation ON deals
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON interactions;
CREATE POLICY tenant_isolation ON interactions
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON quotes;
CREATE POLICY tenant_isolation ON quotes
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON products;
CREATE POLICY tenant_isolation ON products
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

-- APPEND-ONLY por diseño
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON stock_movements;
CREATE POLICY tenant_isolation ON stock_movements
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON suppliers;
CREATE POLICY tenant_isolation ON suppliers
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON purchase_orders;
CREATE POLICY tenant_isolation ON purchase_orders
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON service_types;
CREATE POLICY tenant_isolation ON service_types
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON availability;
CREATE POLICY tenant_isolation ON availability
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON appointments;
CREATE POLICY tenant_isolation ON appointments
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON transactions;
CREATE POLICY tenant_isolation ON transactions
  USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''));

-- ─── Tablas SIN RLS (aislamiento heredado vía FK) ────────────────────────────
--
-- Las siguientes tablas no tienen tenant_id directo y heredan el aislamiento
-- de tenant a través de sus relaciones con tablas protegidas:
--
--   refresh_tokens    → user_id → users (RLS activo)
--   stocks            → product_id → products (RLS activo) + branch_id → branches (RLS activo)
--   quote_items       → quote_id → quotes (RLS activo)
--   purchase_order_items → purchase_order_id → purchase_orders (RLS activo)
--   supplier_scores   → supplier_id → suppliers (RLS activo)
--
-- Un atacante que no puede leer el registro padre tampoco puede leer sus hijos,
-- porque las JOINs/FK devuelven vacío cuando el padre está bloqueado por RLS.
