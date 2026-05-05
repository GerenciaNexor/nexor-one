/**
 * Test 2 — Flujo de inventario KIRA
 *
 * Verifica:
 * - Se puede crear un producto desde el catálogo
 * - Se puede registrar una entrada de stock
 * - El stock aparece actualizado en la pantalla
 */

import { test, expect } from '@playwright/test'
import { api, getSharedToken } from './helpers/api'

test.describe('Flujo KIRA — inventario', () => {
  test.describe.configure({ mode: 'serial' })

  const sku      = `E2E-${Date.now()}`
  const name     = `Producto E2E ${sku}`
  let   token    = ''
  let   productId = ''

  test.beforeAll(() => {
    token = getSharedToken()
  })

  test.afterAll(async () => {
    // Limpieza: eliminar el producto creado
    if (productId) await api(token).delete(`/v1/kira/products/${productId}`)
  })

  // ── Test 2a: crear producto desde la UI ──────────────────────────────────

  test('crear producto en el catálogo', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/kira/products')
    await expect(page.getByRole('heading', { name: 'Catálogo de productos' })).toBeVisible()

    // Abrir modal
    await page.getByRole('button', { name: 'Nuevo producto' }).click()

    // Llenar formulario
    await page.getByPlaceholder('PROD-001').fill(sku)
    await page.getByPlaceholder('Nombre del producto').fill(name)
    await page.getByPlaceholder('caja, frasco, und…').fill('und')

    // Esperar la respuesta POST antes de verificar la lista (Railway puede ser lento bajo carga)
    const productCreated = page.waitForResponse(
      (r) => r.url().includes('/v1/kira/products') && r.status() === 201,
      { timeout: 25_000 },
    )
    await page.getByRole('button', { name: 'Crear producto' }).click()
    await productCreated

    // Verificar que aparece en la lista (cell evita la ambigüedad con la vista mobile)
    await expect(page.getByRole('cell', { name })).toBeVisible({ timeout: 20_000 })

    // Guardar ID para cleanup y siguiente test
    const productsRes = await api(token).get(`/v1/kira/products?search=${encodeURIComponent(sku)}`)
    const data = await productsRes.json() as { data: Array<{ id: string; name: string }> }
    const created = data.data?.find((p) => p.name === name)
    if (created) productId = created.id
  })

  // ── Test 2b: registrar entrada de stock ──────────────────────────────────

  test('registrar entrada de stock y verificar actualización', async ({ page }) => {
    test.skip(!productId, 'Requiere que el producto haya sido creado en el test anterior')

    await page.goto('/kira/stock')

    // Abrir modal de movimiento
    await page.getByRole('button', { name: 'Nuevo movimiento' }).click()
    await expect(page.getByRole('heading', { name: 'Registrar movimiento' })).toBeVisible()

    // Tipo: Entrada (los <label> no tienen htmlFor — se usan selectores CSS de hermano adyacente)
    await page.locator('label:has-text("Tipo *") + select').selectOption('entrada')

    // Esperar a que la opción del producto específico esté en el DOM antes de seleccionarla
    // state:'attached' porque <option> dentro de un <select> cerrado es hidden para Playwright
    await page.waitForSelector(`label:has-text("Producto *") + select option[value="${productId}"]`, { state: 'attached', timeout: 20_000 })

    // Seleccionar el producto creado (por value=id — el label muestra "SKU — Nombre" no solo el nombre)
    await page.locator('label:has-text("Producto *") + select').selectOption(productId)

    // Seleccionar la primera sucursal disponible (requerida para usuarios no-OPERATIVE)
    await page.locator('label:has-text("Sucursal *") + select').selectOption({ index: 1 })

    // Cantidad
    await page.getByPlaceholder('Ej: 20').fill('50')

    // El waitForResponse se crea justo antes del click para que el timer no expire en los pasos anteriores
    const movementCreated = page.waitForResponse(
      (r) => r.url().includes('/v1/kira/stock/movements') && r.status() === 201,
      { timeout: 20_000 },
    )
    await page.getByRole('button', { name: 'Registrar movimiento' }).click()
    await movementCreated

    // Verificar que el stock del producto ahora es 50
    await page.goto('/kira/stock')
    // Esperar que la API de stock responda con datos actualizados antes de verificar
    await page.waitForResponse(
      (r) => r.url().includes('/v1/kira/stock') && r.status() === 200,
      { timeout: 15_000 },
    )
    // getByRole('cell') evita la ambigüedad entre la <td> de desktop y el <p> de mobile (sm:hidden)
    const cell = page.getByRole('cell', { name, exact: true })
    await expect(cell).toBeVisible({ timeout: 10_000 })
    // '..' sube un nivel: <td> → <tr>
    const row = cell.locator('..')
    // La celda muestra "{quantity} {unit}" → "50 und"
    await expect(row.getByText('50 und', { exact: true })).toBeVisible({ timeout: 8_000 })
  })

})
