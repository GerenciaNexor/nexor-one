-- HU-093: Optimización de queries lentas — índices de rendimiento
--
-- Problema 1: Product carece de índice en (tenant_id, is_active).
--   Todas las queries de KIRA filtran { tenantId, isActive: true } y sin este índice
--   el planner hace sequential scan en toda la tabla del tenant (~1000 filas en staging).
--   Afecta: GET /v1/kira/stock, GET /v1/dashboard/kpis (KIRA module).
--
-- Problema 2: Appointment tiene (tenant_id, branch_id, start_at) pero agendaKpis
--   agrupa por { tenantId, startAt } sin branchId. PostgreSQL no puede usar la
--   columna de rango (start_at) eficientemente cuando branch_id está en el medio.
--   Afecta: GET /v1/dashboard/kpis (AGENDA module).

-- CreateIndex
CREATE INDEX "products_tenant_id_is_active_idx" ON "products"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_start_at_idx" ON "appointments"("tenant_id", "start_at");
