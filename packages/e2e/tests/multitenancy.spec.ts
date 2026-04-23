/**
 * Test 5 — Aislamiento multi-tenant
 *
 * Verifica a nivel de API que un usuario del Tenant A no puede leer,
 * modificar ni eliminar recursos del Tenant B aunque conozca los IDs.
 *
 * Requiere que seed-e2e.ts haya creado el segundo tenant:
 *   admin@empresa-b.nexor.co / AdminB456!
 *
 * Este test no usa browser — opera directamente contra la API REST.
 */

import { test, expect } from '@playwright/test'
import { login, api, DEMO_EMAIL, DEMO_PASSWORD, B_EMAIL, B_PASSWORD } from './helpers/api'

interface ProductA { id: string; name: string; sku: string; [k: string]: unknown }
interface ClientA  { id: string; name: string; [k: string]: unknown }

test.describe('Aislamiento multi-tenant', () => {
  let tokenA:    string
  let tokenB:    string
  let productAId: string
  let clientAId:  string

  test.beforeAll(async () => {
    // Login Tenant A
    const authA = await login(DEMO_EMAIL, DEMO_PASSWORD)
    tokenA = authA.token

    // Login Tenant B
    try {
      const authB = await login(B_EMAIL, B_PASSWORD)
      tokenB = authB.token
    } catch {
      // Si el seed-e2e no se ejecutó, el tenant B no existe
      tokenB = ''
    }

    // Crear un producto KIRA en Tenant A para usar como recurso de prueba
    const product = await api(tokenA).post<ProductA>('/v1/kira/products', {
      sku:  `MT-TEST-${Date.now()}`,
      name: `Producto MT Test ${Date.now()}`,
      unit: 'und',
    })
    productAId = product.id

    // Crear un cliente ARI en Tenant A
    const client = await api(tokenA).post<ClientA>('/v1/ari/clients', {
      name: `Cliente MT Test ${Date.now()}`,
    })
    clientAId = client.id
  })

  test.afterAll(async () => {
    if (productAId) await api(tokenA).delete(`/v1/kira/products/${productAId}`)
    if (clientAId)  await api(tokenA).delete(`/v1/ari/clients/${clientAId}`)
  })

  // ── 5a: Tenant B no puede leer recursos de Tenant A ─────────────────────

  test('Tenant B no puede leer producto de Tenant A', async () => {
    test.skip(!tokenB, 'Tenant B no existe — ejecuta pnpm --filter @nexor/api db:seed-e2e')

    const status = await api(tokenB).getStatus(`/v1/kira/products/${productAId}`)
    // El tenantId del JWT de B no coincide → 404 (no encontrado para ese tenant)
    expect(status).toBe(404)
  })

  test('Tenant B no puede leer cliente de Tenant A', async () => {
    test.skip(!tokenB, 'Tenant B no existe — ejecuta pnpm --filter @nexor/api db:seed-e2e')

    const status = await api(tokenB).getStatus(`/v1/ari/clients/${clientAId}`)
    expect(status).toBe(404)
  })

  // ── 5b: Tenant B no puede modificar recursos de Tenant A ────────────────

  test('Tenant B no puede editar producto de Tenant A', async () => {
    test.skip(!tokenB, 'Tenant B no existe — ejecuta pnpm --filter @nexor/api db:seed-e2e')

    const status = await api(tokenB).putStatus(`/v1/kira/products/${productAId}`, { name: 'Hackeado' })
    expect([403, 404]).toContain(status)
  })

  // ── 5c: Tenant B no puede eliminar recursos de Tenant A ─────────────────

  test('Tenant B no puede eliminar producto de Tenant A', async () => {
    test.skip(!tokenB, 'Tenant B no existe — ejecuta pnpm --filter @nexor/api db:seed-e2e')

    const res    = await api(tokenB).delete(`/v1/kira/products/${productAId}`)
    expect([403, 404]).toContain(res.status)

    // Verificar que el producto sigue existiendo para Tenant A
    const statusA = await api(tokenA).getStatus(`/v1/kira/products/${productAId}`)
    expect(statusA).toBe(200)
  })

  // ── 5d: Cada tenant solo ve sus propios listados ─────────────────────────

  test('los listados de Tenant B no exponen datos de Tenant A', async () => {
    test.skip(!tokenB, 'Tenant B no existe — ejecuta pnpm --filter @nexor/api db:seed-e2e')

    const res  = await api(tokenB).get('/v1/kira/products?limit=100')
    const data = await res.json() as { data: ProductA[] }
    const ids  = (data.data ?? []).map((p) => p.id)

    // El producto de Tenant A no debe aparecer en el listado de Tenant B
    expect(ids).not.toContain(productAId)
  })

  // ── 5e: Token inválido es rechazado ──────────────────────────────────────

  test('token manipulado es rechazado con 401', async () => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJmYWtlIiwidGVuYW50SWQiOiJmYWtlIn0.fake_signature'
    const status    = await api(fakeToken).getStatus(`/v1/kira/products/${productAId}`)
    expect(status).toBe(401)
  })

})
