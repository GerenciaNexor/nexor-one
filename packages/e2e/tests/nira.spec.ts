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
interface Product  { id: string; sku: string; name: string }
interface PO       { id: string; orderNumber: string; status: string }
interface TxList   { data: Array<{ id: string; referenceType: string; referenceId: string; category: string | null }> }

test.describe('Flujo NIRA — orden de compra', () => {
  test.describe.configure({ mode: 'serial' })

  let token:        string
  let supplierId:   string
  let supplierName: string
  let productId:    string
  let poId:         string

  test.beforeAll(async () => {
    // ARI + KIRA acumulan ~90 peticiones en ~35 segundos, agotando el cupo de 100/min.
    // Esperamos 62s para que la ventana de rate-limit se renueve antes de crear datos de prueba.
    test.setTimeout(90_000)
    token = getSharedToken()
    await new Promise<void>((resolve) => setTimeout(resolve, 62_000))

    // Crear proveedor de prueba vía API
    supplierName = `Proveedor E2E ${Date.now()}`
    const supplier = await api(token).post<Supplier>('/v1/nira/suppliers', {
      name:  supplierName,
      email: `proveedor-e2e-${Date.now()}@test.com`,
    })
    supplierId = supplier.id

    // Crear un producto KIRA para garantizar que el modal de OC tenga al menos uno disponible
    // (KIRA afterAll borra su propio producto, por lo que NIRA necesita crear el suyo)
    const product = await api(token).post<Product>('/v1/kira/products', {
      sku:  `NIRA-E2E-${Date.now()}`,
      name: `Producto NIRA E2E ${Date.now()}`,
      unit: 'und',
    })
    productId = product.id
  })

  test.afterAll(async () => {
    if (poId)       await api(token).delete(`/v1/nira/purchase-orders/${poId}`)
    if (supplierId) await api(token).delete(`/v1/nira/suppliers/${supplierId}`)
    if (productId)  await api(token).delete(`/v1/kira/products/${productId}`)
  })

  // ── Test 3a: crear borrador de OC desde la UI ────────────────────────────

  test('crear OC, enviar a aprobación y aprobar', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/nira/purchase-orders')
    await expect(page.getByRole('button', { name: 'Nueva OC' })).toBeVisible()

    // Abrir modal de creación
    await page.getByRole('button', { name: 'Nueva OC' }).click()
    await page.waitForSelector('h2:has-text("Nueva orden de compra")', { timeout: 20_000 })

    // form#po-form existe solo dentro del modal — scope estable contra el Portal y re-renders de React
    const form = page.locator('form#po-form')
    await form.waitFor({ state: 'visible', timeout: 10_000 })

    // Esperar a que los fetches iniciales del modal (proveedores, sucursales, productos) terminen
    // antes de interactuar. Reduce burst de peticiones y el riesgo de rate-limit en el POST.
    await page.waitForLoadState('networkidle', { timeout: 15_000 })

    // Primer select del form = proveedor. Esperar la opción específica dentro de ese select.
    const supplierSelect = form.locator('select').first()
    await expect(supplierSelect.locator(`option[value="${supplierId}"]`)).toBeAttached({ timeout: 35_000 })
    await supplierSelect.selectOption({ value: supplierId })
    // Verificar que el DOM refleja la selección del proveedor (confirma que React procesó el onChange)
    await expect(supplierSelect).toHaveValue(supplierId)

    // Tercer select del form = producto (segundo es sucursal). Esperar que tenga opciones.
    const productSelect = form.locator('select').filter({ hasText: 'Seleccionar producto' }).first()
    await expect(productSelect.locator('option').nth(1)).toBeAttached({ timeout: 35_000 })
    await productSelect.selectOption({ index: 1 })
    // Verificar que el DOM refleja la selección del producto
    await expect(productSelect).not.toHaveValue('')

    // Crear borrador — capturar cualquier respuesta POST (no solo 201) para diagnóstico preciso
    const draftCreated = page.waitForResponse(
      (r) => r.url().includes('/v1/nira/purchase-orders') && r.request().method() === 'POST',
      { timeout: 45_000 },
    )
    await page.getByRole('button', { name: 'Crear borrador' }).click()
    const draftRes = await draftCreated
    const draftStatus = draftRes.status()
    if (draftStatus !== 201) {
      const body = await draftRes.text()
      throw new Error(`POST /v1/nira/purchase-orders → ${draftStatus}: ${body}`)
    }

    // Modal debe cerrarse rápido una vez que el servidor respondió
    await page.waitForSelector('h2:has-text("Nueva orden de compra")', { state: 'hidden', timeout: 10_000 })

    // Hacer click en la fila de la OC recién creada para ir al detalle
    await page.getByRole('cell', { name: supplierName }).click()

    // Esperar navegación al detalle de la OC
    await page.waitForURL('**/nira/purchase-orders/**', { timeout: 10_000 })

    // Guardar ID desde la URL
    const url = page.url()
    poId = url.split('/').pop() ?? ''

    // La OC está en borrador — enviar a aprobación
    await page.getByRole('button', { name: 'Enviar a aprobación' }).click()
    // Confirmar (exact:true para no matchear "Enviar a aprobación" que queda detrás del modal)
    await page.getByRole('button', { name: 'Enviar', exact: true }).click()

    // Ahora está en pending_approval — aprobar
    await expect(page.getByRole('button', { name: 'Aprobar OC' })).toBeVisible({ timeout: 8_000 })
    await page.getByRole('button', { name: 'Aprobar OC' }).click()
    // Confirmar aprobación (exact:true para no matchear "Aprobar OC" que queda detrás)
    await page.getByRole('button', { name: 'Aprobar', exact: true }).click()

    // Verificar estado "Aprobada" (exact:true para no matchear también "Aprobada por")
    await expect(page.getByText('Aprobada', { exact: true })).toBeVisible({ timeout: 8_000 })
  })

  // ── Test 3b: verificar egreso en VERA ────────────────────────────────────

  test('el egreso aparece en VERA con categoría Compras', async ({ page }) => {
    test.skip(!poId, 'Requiere que la OC haya sido aprobada en el test anterior')

    // Verificar vía API que la transacción existe
    const txRes  = await api(token).get('/v1/vera/transactions?referenceType=purchase_order&limit=50')
    const txList = await txRes.json() as TxList
    const tx = txList.data?.find((t) => t.referenceId === poId)
    expect(tx).toBeDefined()
    expect(tx?.referenceType).toBe('purchase_order')

    // Verificar en la UI de VERA (.first() evita strict mode cuando hay varias filas con "Compras")
    await page.goto('/vera/transactions')
    await expect(page.getByText('Compras').first()).toBeVisible({ timeout: 8_000 })
  })

})
