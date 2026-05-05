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
    await page.goto('/kira/products')
    await expect(page.getByRole('heading', { name: 'Catálogo de productos' })).toBeVisible()

    // Abrir modal
    await page.getByRole('button', { name: 'Nuevo producto' }).click()

    // Llenar formulario
    await page.getByPlaceholder('PROD-001').fill(sku)
    await page.getByPlaceholder('Nombre del producto').fill(name)
    await page.getByPlaceholder('caja, frasco, und…').fill('und')

    // Enviar
    await page.getByRole('button', { name: 'Crear producto' }).click()

    // Verificar que aparece en la lista
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 })

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
    await expect(page.getByText('Registrar movimiento')).toBeVisible()

    // Tipo: Entrada
    await page.getByLabel('Tipo *').selectOption('entrada')

    // Seleccionar el producto creado
    await page.getByLabel('Producto *').selectOption({ label: name })

    // Cantidad
    await page.getByPlaceholder('Ej: 20').fill('50')

    // Registrar
    await page.getByRole('button', { name: 'Registrar movimiento' }).click()

    // Verificar que el stock del producto ahora es 50
    await page.goto('/kira/stock')
    await expect(page.getByText(name)).toBeVisible()
    const row = page.getByText(name).locator('../..')
    await expect(row.getByText('50')).toBeVisible({ timeout: 8_000 })
  })

})
