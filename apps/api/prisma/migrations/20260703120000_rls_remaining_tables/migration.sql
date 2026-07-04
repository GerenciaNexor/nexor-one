-- ============================================================================
-- HU-135-fix — Completar la cobertura RLS de las 5 tablas restantes.
--
-- HU-135 confirmó 26/26 tablas aisladas, pero reportó 5 tablas con tenant_id fuera
-- de db:rls (aisladas solo por el filtrado en el servicio, no por la BD):
--   blocked_dates, appointment_cancel_tokens, transaction_categories,
--   cost_centers, monthly_budgets.
-- Esta migración las fuerza a la capa de BD con el MISMO patrón tenant_isolation que
-- el resto (precedente HU-114/HU-117). El conteo de tablas con RLS sube de 26 a 31.
--
-- Consumos fuera de contexto de tenant verificados y ajustados ANTES de forzar RLS:
--   · ruta pública de cancelación (/v1/agenda/cancel) → directPrisma
--   · job de recordatorios (appointment-reminders) → directPrisma
--   El resto (VERA, AGENDA, dashboard, agente) ya corre en contexto (request tx /
--   runInTenantTransaction / withTenantContext).
-- ============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'blocked_dates',
    'appointment_cancel_tokens',
    'transaction_categories',
    'cost_centers',
    'monthly_budgets'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING (tenant_id::text = NULLIF(current_setting(''app.current_tenant_id'', TRUE), '''')) '
      'WITH CHECK (tenant_id::text = NULLIF(current_setting(''app.current_tenant_id'', TRUE), ''''))',
      t
    );
    -- El rol de aplicación ya existe (20260318120000_add_rls_policies). Garantizar acceso.
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO nexor_app', t);
  END LOOP;
END $$;
