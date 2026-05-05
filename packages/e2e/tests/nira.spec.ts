/**
 * Test 3 — Flujo de orden de compra NIRA
 *
 * Verifica:
 * - Se puede crear una OC con un proveedor existente
 * - Se puede enviar la OC a aprobación
 * - Se puede aprobar la OC
 * - El egreso aparece en VERA con categoría "Compras"
 */

import { test, expect } from '@playwright/test'
import { api, getSharedToken } from './helpers/api'

interface Supplier { id: string; name: string }
interface PO       { id: string; orderNumber: string; status: string }
interface TxList   { data: Array<{ id: string; referenceType: string; referenceId: string; category: string | null }> }

test.describe('Flujo NIRA — orden de compra', () => {
  let token:        string
  let supplierId:   string
  let supplierName: string
  let poId:         string

  test.beforeAll(async () => {
    token = getSharedToken()

    // Crear proveedor de prueba vía API
    supplierName = `Proveedor E2E ${Date.now()}`
    const supplier = await api(token).post<Supplier>('/v1/nira/suppliers', {
      name:  supplierName,
      email: `proveedor-e2e-${Date.now()}@test.com`,
    })
    supplierId = supplier.id
  })

  test.afterAll(async () => {
    if (poId)       await api(token).delete(`/v1/nira/purchase-orders/${poId}`)
    if (supplierId) await api(token).delete(`/v1/nira/suppliers/${supplierId}`)
  })

  // ── Test 3a: crear borrador de OC desde la UI ────────────────────────────

  test('crear OC, enviar a aprobación y aprobar', async ({ page }) => {
    await page.goto('/nira/purchase-orders')
    await expect(page.getByRole('button', { name: 'Nueva OC' })).toBeVisible()

    // Abrir modal de creación
    await page.getByRole('button', { name: 'Nueva OC' }).click()

    // Seleccionar proveedor
    await page.getByLabel('Proveedor *').selectOption({ label: supplierName })

    // Crear borrador
    await page.getByRole('button', { name: 'Crear borrador' }).click()

    // Esperar redirect al detalle de la OC
    await page.waitForURL('**/nira/purchase-orders/**', { timeout: 10_000 })

    // Guardar ID desde la URL
    const url = page.url()
    poId = url.split('/').pop() ?? ''

    // La OC está en borrador — enviar a aprobación
    await page.getByRole('button', { name: 'Enviar a aprobación' }).click()
    // Confirmar
    await page.getByRole('button', { name: 'Enviar' }).click()

    // Ahora está en pending_approval — aprobar
    await expect(page.getByRole('button', { name: 'Aprobar OC' })).toBeVisible({ timeout: 8_000 })
    await page.getByRole('button', { name: 'Aprobar OC' }).click()
    // Confirmar aprobación
    await page.getByRole('button', { name: 'Aprobar' }).click()

    // Verificar estado "Aprobada" en la página
    await expect(page.getByText('Aprobada')).toBeVisible({ timeout: 8_000 })
  })

  // ── Test 3b: verificar egreso en VERA ────────────────────────────────────

  test('el egreso aparece en VERA con categoría Compras', async ({ page }) => {
    test.skip(!poId, 'Requiere que la OC haya sido aprobada en el test anterior')

    // Verificar vía API que la transacción existe
    const txRes  = await api(token).get('/v1/vera/transactions?referenceType=purchase_order&limit=5')
    const txList = await txRes.json() as TxList
    const tx = txList.data?.find((t) => t.referenceId === poId)
    expect(tx).toBeDefined()
    expect(tx?.referenceType).toBe('purchase_order')

    // Verificar en la UI de VERA
    await page.goto('/vera/transactions')
    await expect(page.getByText('Compras')).toBeVisible({ timeout: 8_000 })
  })

})
