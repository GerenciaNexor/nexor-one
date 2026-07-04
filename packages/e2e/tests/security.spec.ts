/**
 * HU-086 — Suite de seguridad: aislamiento multi-tenant
 *
 * Verifica sistemáticamente que ningún tenant puede ver, modificar
 * ni eliminar recursos de otro tenant en ninguno de los 5 módulos.
 * También cubre acceso de SUPER_ADMIN y ataques con tokens inválidos.
 *
 * Todos los tests son API-only (sin browser) para maximizar velocidad.
 * Target: suite completa < 2 minutos.
 */

import { test, expect } from '@playwright/test'
import {
  login, loginPlatform, api,
  DEMO_EMAIL, DEMO_PASSWORD,
  B_EMAIL, B_PASSWORD,
  SUPER_EMAIL, SUPER_PASSWORD,
  API_URL,
} from './helpers/api'

// ── Tipos mínimos ─────────────────────────────────────────────────────────────

interface WithId   { id: string }
interface ListResp { data: WithId[] }

// ── Estado compartido entre todos los tests ───────────────────────────────────

let tokenA:    string
let tokenB:    string
let tokenSuper: string
let tenantAId: string
let tenantBId: string
let branchAId: string

let productId:     string
let supplierId:    string
let poId:          string
let clientId:      string
let dealId:        string
let appointmentId: string
let transactionId: string

// ── Setup: crear datos de prueba en Tenant A ──────────────────────────────────

test.beforeAll(async () => {
  // Login de los 3 actores. HU-134 — el super admin es una identidad de PLATAFORMA
  // (tabla platform_admins) y entra por un endpoint propio que emite un JWT sin tenantId.
  const authA     = await login(DEMO_EMAIL, DEMO_PASSWORD)
  const authB     = await login(B_EMAIL,    B_PASSWORD)
  const authSuper = await loginPlatform(SUPER_EMAIL, SUPER_PASSWORD)

  tokenA     = authA.token
  tokenB     = authB.token
  tokenSuper = authSuper.token
  tenantAId  = authA.user.tenantId
  tenantBId  = authB.user.tenantId
  branchAId  = authA.user.branchId ?? ''

  const ts = Date.now()
  const c  = api(tokenA)

  // KIRA — producto
  const product = await c.post<WithId>('/v1/kira/products', {
    sku:  `SEC-${ts}`,
    name: `Producto Seg ${ts}`,
    unit: 'und',
  })
  productId = product.id

  // NIRA — proveedor + OC borrador
  const supplier = await c.post<WithId>('/v1/nira/suppliers', {
    name:  `Proveedor Seg ${ts}`,
    email: `seg-${ts}@test.nexor.co`,
  })
  supplierId = supplier.id

  const po = await c.post<WithId>('/v1/nira/purchase-orders', {
    supplierId,
    notes: 'OC seguridad HU-086',
    items: [{ productId: 'seed-e2e-product-001', quantityOrdered: 1, unitCost: 10000 }],
  })
  poId = po.id

  // ARI — cliente + deal
  const client = await c.post<WithId>('/v1/ari/clients', { name: `Cliente Seg ${ts}` })
  clientId = client.id

  const stagesRes  = await c.get('/v1/ari/stages')
  const stages     = await stagesRes.json() as { data: WithId[] }
  const stageId    = stages.data[0]?.id ?? ''

  const deal = await c.post<WithId>('/v1/ari/deals', {
    clientId,
    stageId,
    title: `Deal Seg ${ts}`,
    value: 50000,
  })
  dealId = deal.id

  // AGENDA — cita usando service type y disponibilidad del seed-e2e
  // La cita es en 14 días a las 10:00 hora Bogotá (= 15:00 UTC con UTC-5)
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + 14)
  const startAt = `${futureDate.toISOString().slice(0, 10)}T15:00:00.000Z`

  const appt = await c.post<WithId>('/v1/agenda/appointments', {
    branchId:      branchAId,
    serviceTypeId: 'seed-e2e-svc-001',
    startAt,
    clientName:    `Paciente Seg ${ts}`,
  })
  appointmentId = appt.id

  // VERA — transacción manual
  const tx = await c.post<WithId>('/v1/vera/transactions', {
    type:        'income',
    amount:      9_999,
    date:        new Date().toISOString().slice(0, 10),
    description: `TX seguridad HU-086 ${ts}`,
  })
  transactionId = tx.id
})

// ── Teardown: limpiar todos los recursos creados ──────────────────────────────

test.afterAll(async () => {
  const c = api(tokenA)
  // Cancelar cita antes de eliminarla (si no se puede borrar directamente)
  if (appointmentId) {
    await c.patchStatus(`/v1/agenda/appointments/${appointmentId}/status`, { status: 'cancelled' })
  }
  // VERA DELETE retorna 204 — usar raw response
  if (transactionId) await c.delete(`/v1/vera/transactions/${transactionId}`)
  if (dealId)        await c.delete(`/v1/ari/deals/${dealId}`)
  if (clientId)      await c.delete(`/v1/ari/clients/${clientId}`)
  if (poId)          await c.delete(`/v1/nira/purchase-orders/${poId}`)
  if (supplierId)    await c.delete(`/v1/nira/suppliers/${supplierId}`)
  if (productId)     await c.delete(`/v1/kira/products/${productId}`)
})

// ═════════════════════════════════════════════════════════════════════════════
// KIRA — Aislamiento de inventario
// ═════════════════════════════════════════════════════════════════════════════

test.describe('KIRA — aislamiento de inventario', () => {

  test('listado de B no contiene productos de A', async () => {
    const res  = await api(tokenB).get('/v1/kira/products?limit=100')
    expect(res.status).toBe(200)
    const data = await res.json() as ListResp
    expect(data.data.map(p => p.id)).not.toContain(productId)
  })

  test('B obtiene 404 al pedir detalle de producto de A', async () => {
    const status = await api(tokenB).getStatus(`/v1/kira/products/${productId}`)
    expect(status).toBe(404)
  })

  test('B obtiene 403/404 al intentar editar producto de A', async () => {
    const status = await api(tokenB).putStatus(`/v1/kira/products/${productId}`, { name: 'Hackeado' })
    expect([403, 404]).toContain(status)
  })

  test('B obtiene 403/404 al intentar eliminar producto de A', async () => {
    const status = await api(tokenB).deleteStatus(`/v1/kira/products/${productId}`)
    expect([403, 404]).toContain(status)
    // Verificar que el recurso sigue intacto para A
    expect(await api(tokenA).getStatus(`/v1/kira/products/${productId}`)).toBe(200)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// NIRA — Aislamiento de compras
// ═════════════════════════════════════════════════════════════════════════════

test.describe('NIRA — aislamiento de compras', () => {

  test('listado de proveedores de B no contiene proveedor de A', async () => {
    const res  = await api(tokenB).get('/v1/nira/suppliers?limit=100')
    expect(res.status).toBe(200)
    const data = await res.json() as ListResp
    expect(data.data.map(s => s.id)).not.toContain(supplierId)
  })

  test('B obtiene 404 al pedir detalle de proveedor de A', async () => {
    const status = await api(tokenB).getStatus(`/v1/nira/suppliers/${supplierId}`)
    expect(status).toBe(404)
  })

  test('listado de OC de B no contiene OC de A', async () => {
    const res  = await api(tokenB).get('/v1/nira/purchase-orders?limit=100')
    expect(res.status).toBe(200)
    const data = await res.json() as ListResp
    expect(data.data.map(o => o.id)).not.toContain(poId)
  })

  test('B obtiene 404 al pedir detalle de OC de A', async () => {
    const status = await api(tokenB).getStatus(`/v1/nira/purchase-orders/${poId}`)
    expect(status).toBe(404)
  })

  test('B obtiene 403/404 al intentar editar OC de A', async () => {
    const status = await api(tokenB).putStatus(`/v1/nira/purchase-orders/${poId}`, { notes: 'Hackeado' })
    expect([403, 404]).toContain(status)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// ARI — Aislamiento de CRM y pipeline
// ═════════════════════════════════════════════════════════════════════════════

test.describe('ARI — aislamiento de CRM', () => {

  test('listado de clientes de B no contiene cliente de A', async () => {
    const res  = await api(tokenB).get('/v1/ari/clients?limit=100')
    expect(res.status).toBe(200)
    const data = await res.json() as ListResp
    expect(data.data.map(c => c.id)).not.toContain(clientId)
  })

  test('B obtiene 404 al pedir detalle de cliente de A', async () => {
    const status = await api(tokenB).getStatus(`/v1/ari/clients/${clientId}`)
    expect(status).toBe(404)
  })

  test('listado de deals de B no contiene deal de A', async () => {
    const res  = await api(tokenB).get('/v1/ari/deals?limit=100')
    expect(res.status).toBe(200)
    const data = await res.json() as ListResp
    expect(data.data.map(d => d.id)).not.toContain(dealId)
  })

  test('B obtiene 404 al pedir detalle de deal de A', async () => {
    const status = await api(tokenB).getStatus(`/v1/ari/deals/${dealId}`)
    expect(status).toBe(404)
  })

  test('B obtiene 403/404 al intentar mover deal de A a otra etapa', async () => {
    // Obtener una etapa del tenant B para el intento de movimiento
    const stagesRes = await api(tokenB).get('/v1/ari/stages')
    const stages    = await stagesRes.json() as { data: WithId[] }
    const stageBId  = stages.data[0]?.id ?? 'fake-stage-id'

    const status = await api(tokenB).putStatus(`/v1/ari/deals/${dealId}/stage`, { stageId: stageBId })
    expect([403, 404]).toContain(status)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// AGENDA — Aislamiento de citas
// ═════════════════════════════════════════════════════════════════════════════

test.describe('AGENDA — aislamiento de citas', () => {

  test('listado de servicios de B no contiene servicio de A', async () => {
    const res  = await api(tokenB).get('/v1/agenda/services')
    expect(res.status).toBe(200)
    const data = await res.json() as ListResp
    expect(data.data.map(s => s.id)).not.toContain('seed-e2e-svc-001')
  })

  test('B obtiene 404 al pedir detalle de servicio de A', async () => {
    const status = await api(tokenB).getStatus('/v1/agenda/services/seed-e2e-svc-001')
    expect(status).toBe(404)
  })

  test('listado de citas de B no contiene cita de A', async () => {
    const res  = await api(tokenB).get('/v1/agenda/appointments')
    expect(res.status).toBe(200)
    const data = await res.json() as ListResp
    expect(data.data.map(a => a.id)).not.toContain(appointmentId)
  })

  test('B obtiene 403/404 al intentar cambiar estado de cita de A', async () => {
    const status = await api(tokenB).patchStatus(
      `/v1/agenda/appointments/${appointmentId}/status`,
      { status: 'cancelled' },
    )
    expect([403, 404]).toContain(status)
    // Verificar que la cita sigue activa para A
    expect(await api(tokenA).getStatus(`/v1/agenda/appointments`)).toBe(200)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// VERA — Aislamiento financiero
// ═════════════════════════════════════════════════════════════════════════════

test.describe('VERA — aislamiento financiero', () => {

  test('listado de transacciones de B no contiene transacción de A', async () => {
    const res  = await api(tokenB).get('/v1/vera/transactions?limit=100')
    expect(res.status).toBe(200)
    const data = await res.json() as ListResp
    expect(data.data.map(t => t.id)).not.toContain(transactionId)
  })

  test('B obtiene 404 al pedir detalle de transacción de A', async () => {
    const status = await api(tokenB).getStatus(`/v1/vera/transactions/${transactionId}`)
    expect(status).toBe(404)
  })

  test('B obtiene 403/404 al intentar editar transacción de A', async () => {
    const status = await api(tokenB).putStatus(
      `/v1/vera/transactions/${transactionId}`,
      { description: 'Hackeado' },
    )
    expect([403, 404]).toContain(status)
  })

  test('B obtiene 403/404 al intentar eliminar transacción de A', async () => {
    const status = await api(tokenB).deleteStatus(`/v1/vera/transactions/${transactionId}`)
    expect([403, 404]).toContain(status)
    // Verificar que la transacción sigue existiendo para A
    expect(await api(tokenA).getStatus(`/v1/vera/transactions/${transactionId}`)).toBe(200)
  })

  test('B obtiene 403/404 al intentar clasificar transacción de A', async () => {
    const status = await api(tokenB).patchStatus(
      `/v1/vera/transactions/${transactionId}/classify`,
      { categoryId: null },
    )
    expect([403, 404]).toContain(status)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// INBOX y BULK-UPLOAD — Aislamiento de bandeja y carga masiva (HU-114)
// Datos sembrados con IDs fijos en seed-e2e.ts para A (demo) y B (test-empresa-b).
// ═════════════════════════════════════════════════════════════════════════════

const CONV_A    = 'seed-e2e-conv-a-001'
const CONV_B    = 'seed-e2e-conv-b-001'
const BULKLOG_A = 'seed-e2e-bulklog-a-001'
const BULKLOG_B = 'seed-e2e-bulklog-b-001'

test.describe('INBOX — aislamiento de bandeja', () => {

  test('la bandeja de B no contiene la conversación de A', async () => {
    const res = await api(tokenB).get('/v1/inbox')
    expect(res.status).toBe(200)
    const data = await res.json() as ListResp
    expect((data.data ?? []).map(c => c.id)).not.toContain(CONV_A)
  })

  test('B obtiene 403/404 al pedir la conversación de A (forzando ID)', async () => {
    const status = await api(tokenB).getStatus(`/v1/inbox/${CONV_A}`)
    expect([403, 404]).toContain(status)
  })

  test('A obtiene 403/404 al pedir la conversación de B (forzando ID)', async () => {
    const status = await api(tokenA).getStatus(`/v1/inbox/${CONV_B}`)
    expect([403, 404]).toContain(status)
  })
})

test.describe('BULK-UPLOAD — aislamiento de cargas masivas', () => {

  test('el historial de cargas de B no contiene el log de A', async () => {
    const res = await api(tokenB).get('/v1/bulk-upload/logs')
    expect(res.status).toBe(200)
    const data = await res.json() as ListResp
    expect((data.data ?? []).map(l => l.id)).not.toContain(BULKLOG_A)
  })

  test('B obtiene 403/404 al pedir el log de carga de A (forzando ID)', async () => {
    const status = await api(tokenB).getStatus(`/v1/bulk-upload/logs/${BULKLOG_A}`)
    expect([403, 404]).toContain(status)
  })

  test('A obtiene 403/404 al pedir el log de carga de B (forzando ID)', async () => {
    const status = await api(tokenA).getStatus(`/v1/bulk-upload/logs/${BULKLOG_B}`)
    expect([403, 404]).toContain(status)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// SUPER_ADMIN — Panel de administración y visibilidad global
// ═════════════════════════════════════════════════════════════════════════════

test.describe('SUPER_ADMIN — visibilidad global', () => {

  test('ve los logs de carga masiva de ambos tenants (vista global cross-tenant)', async () => {
    const res = await api(tokenSuper).get('/v1/admin/bulk-upload/logs?limit=100')
    expect(res.status).toBe(200)
    const data = await res.json() as ListResp
    const ids  = (data.data ?? []).map(l => l.id)
    expect(ids).toContain(BULKLOG_A)
    expect(ids).toContain(BULKLOG_B)
  })

  test('puede listar todos los tenants y ve tanto A como B', async () => {
    const res  = await api(tokenSuper).get('/v1/admin/tenants?limit=100')
    expect(res.status).toBe(200)
    const data = await res.json() as { data: Array<{ id: string }> }
    const ids  = data.data.map(t => t.id)
    expect(ids).toContain(tenantAId)
    expect(ids).toContain(tenantBId)
  })

  test('puede obtener el detalle de Tenant A', async () => {
    const status = await api(tokenSuper).getStatus(`/v1/admin/tenants/${tenantAId}`)
    expect(status).toBe(200)
  })

  test('puede obtener el detalle de Tenant B', async () => {
    const status = await api(tokenSuper).getStatus(`/v1/admin/tenants/${tenantBId}`)
    expect(status).toBe(200)
  })

  test('puede impersonar Tenant A y recibe un token válido', async () => {
    const res  = await api(tokenSuper).post<{ token: string; expiresIn: string }>(
      `/v1/admin/tenants/${tenantAId}/impersonate`,
      {},
    )
    expect(res.token).toBeTruthy()
    expect(res.expiresIn).toBe('1h')

    // El token de impersonación puede leer productos de Tenant A
    const prodStatus = await api(res.token).getStatus(`/v1/kira/products/${productId}`)
    expect(prodStatus).toBe(200)
  })

  test('TENANT_ADMIN obtiene 403 al intentar acceder al panel admin', async () => {
    const status = await api(tokenA).getStatus('/v1/admin/tenants')
    expect(status).toBe(403)
  })

  test('Tenant B obtiene 403 al intentar acceder al panel admin', async () => {
    const status = await api(tokenB).getStatus('/v1/admin/tenants')
    expect(status).toBe(403)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// HU-134 — Separación de identidades: PLATAFORMA vs TENANT
// ═════════════════════════════════════════════════════════════════════════════

test.describe('HU-134 — identidad de plataforma separada del tenant', () => {

  test('el JWT de plataforma NO lleva tenantId', async () => {
    const payloadB64 = tokenSuper.split('.')[1] ?? ''
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as Record<string, unknown>
    expect(payload['tenantId']).toBeUndefined()
    expect(payload['platformAdminId']).toBeTruthy()
    expect(payload['role']).toBe('SUPER_ADMIN')
  })

  test('el token de plataforma NO puede acceder a recursos de un tenant (403)', async () => {
    const status = await api(tokenSuper).getStatus('/v1/kira/products')
    expect(status).toBe(403)
  })

  test('el super admin NO existe como usuario de tenant: el login de tenant falla', async () => {
    const res = await fetch(`${API_URL}/v1/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: SUPER_EMAIL, password: SUPER_PASSWORD }),
    })
    expect(res.status).toBe(401)
  })

  test('un token de tenant NO puede usar el login/endpoints de plataforma (403 en panel)', async () => {
    // Un token de cliente carece de platformAdminId → el panel de plataforma lo rechaza.
    const status = await api(tokenA).getStatus('/v1/admin/tenants')
    expect(status).toBe(403)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Ataques con tokens inválidos
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Ataques con tokens inválidos', () => {

  test('sin token → 401 en endpoint de KIRA', async () => {
    const res = await fetch(`${API_URL}/v1/kira/products`)
    expect(res.status).toBe(401)
  })

  test('token malformado → 401', async () => {
    const status = await api('esto-no-es-un-jwt').getStatus('/v1/kira/products')
    expect(status).toBe(401)
  })

  test('token con payload manipulado (tenant_id swapeado) → 401', async () => {
    // Decodificar payload, cambiar tenantId al del Tenant B, firma queda inválida
    const [header, payloadB64] = tokenA.split('.')
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as Record<string, unknown>
    payload['tenantId'] = tenantBId
    const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const tamperedToken   = `${header}.${tamperedPayload}.firma_invalida_HU086`

    const status = await api(tamperedToken).getStatus(`/v1/kira/products/${productId}`)
    expect(status).toBe(401)
  })

  test('token expirado (exp en el pasado) → 401', async () => {
    // JWT bien formado estructuralmente pero con exp=1 (1970) y firma inválida
    const header  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
    const payload = Buffer.from(JSON.stringify({
      userId:   'test-user',
      tenantId: tenantAId,
      role:     'TENANT_ADMIN',
      exp:      1,         // expirado en 1970-01-01T00:00:01Z
      iat:      1,
    })).toString('base64url')
    const expiredToken = `${header}.${payload}.firma_invalida_expirado`

    const status = await api(expiredToken).getStatus('/v1/kira/products')
    expect(status).toBe(401)
  })

  test('token de Tenant A no da acceso al endpoint de admin → 403', async () => {
    const status = await api(tokenA).getStatus('/v1/admin/tenants')
    expect(status).toBe(403)
  })
})
