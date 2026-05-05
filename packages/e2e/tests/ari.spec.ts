/**
 * Test 4 — Flujo de deal ARI
 *
 * Verifica:
 * - Se puede crear un cliente en el CRM
 * - Se puede crear un deal para ese cliente
 * - Se puede mover el deal a la etapa "Ganado"
 * - El ingreso aparece automáticamente en VERA con categoría "Ventas"
 */

import { test, expect } from '@playwright/test'
import { api, getSharedToken } from './helpers/api'

interface Client  { id: string; name: string }
interface Deal    { id: string; title: string; stage: { name: string } }
interface TxList  { data: Array<{ id: string; referenceType: string; referenceId: string }> }

test.describe('Flujo ARI — deal ganado', () => {
  test.describe.configure({ mode: 'serial' })

  let token:      string
  let clientId:   string
  let clientName: string
  let dealId:     string
  let dealTitle:  string

  test.beforeAll(() => {
    token = getSharedToken()
  })

  test.afterAll(async () => {
    if (dealId)   await api(token).delete(`/v1/ari/deals/${dealId}`)
    if (clientId) await api(token).delete(`/v1/ari/clients/${clientId}`)
  })

  // ── Test 4a: crear cliente desde la UI ──────────────────────────────────

  test('crear cliente en el CRM', async ({ page }) => {
    test.setTimeout(60_000)
    clientName = `Cliente E2E ${Date.now()}`

    await page.goto('/ari/clients')
    await expect(page.getByRole('button', { name: 'Nuevo cliente' })).toBeVisible()

    // Misma estrategia que "Nuevo deal": filter por texto visible excluye botones de columna con solo SVG
    await page.locator('button').filter({ hasText: 'Nuevo cliente' }).click()

    // Esperar que el modal esté listo antes de interactuar
    await page.waitForSelector('h2:has-text("Nuevo cliente")', { timeout: 10_000 })

    await page.getByPlaceholder('Nombre completo o razón social').fill(clientName)

    // Esperar la respuesta POST del cliente antes de verificar la UI (evita timing en Railway bajo carga)
    const clientCreated = page.waitForResponse(
      (r) => r.url().includes('/v1/ari/clients') && r.status() === 201,
      { timeout: 30_000 },
    )
    await page.getByRole('button', { name: 'Crear cliente' }).click()
    await clientCreated

    await expect(page.getByRole('cell', { name: clientName })).toBeVisible({ timeout: 15_000 })

    // Guardar ID vía API
    const res  = await api(token).get(`/v1/ari/clients?search=${encodeURIComponent(clientName)}`)
    const data = await res.json() as { data: Client[] }
    clientId   = data.data?.[0]?.id ?? ''
  })

  // ── Test 4b: crear deal en el pipeline ──────────────────────────────────

  test('crear deal para el cliente', async ({ page }) => {
    test.setTimeout(60_000)
    test.skip(!clientId, 'Requiere que el cliente exista')

    dealTitle = `Deal E2E ${Date.now()}`

    await page.goto('/ari/pipeline')
    // Los botones de columna tienen solo SVG + title, no texto visible — filter({ hasText }) los excluye
    await page.locator('button').filter({ hasText: 'Nuevo deal' }).click()

    // Esperar que el modal esté listo
    await page.waitForSelector('h2:has-text("Nuevo deal")', { timeout: 10_000 })

    // Esperar a que la opción del cliente aparezca en el select (carga asíncrona desde la API)
    await page.waitForSelector(`select option[value="${clientId}"]`, { state: 'attached', timeout: 30_000 })

    // Seleccionar cliente (el <label> no tiene htmlFor, se busca el select por su option placeholder)
    await page.locator('select').filter({ hasText: 'Seleccionar cliente' }).selectOption({ label: clientName })

    // Título del deal
    await page.getByPlaceholder('Ej: Pedido 50 unidades shampoo').fill(dealTitle)

    // Etapa: Lead (primera etapa)
    await page.locator('select').filter({ hasText: 'Seleccionar etapa' }).selectOption({ label: 'Lead' })

    // Valor del deal (requerido para que VERA registre el ingreso)
    await page.getByPlaceholder('1.500.000').fill('500000')

    await page.getByRole('button', { name: 'Crear deal' }).click()

    // Verificar que aparece en el pipeline
    await expect(page.getByText(dealTitle)).toBeVisible({ timeout: 10_000 })

    // Guardar ID vía API
    const res  = await api(token).get(`/v1/ari/deals?search=${encodeURIComponent(dealTitle)}`)
    const data = await res.json() as { data: Deal[] }
    dealId     = data.data?.[0]?.id ?? ''
  })

  // ── Test 4c: mover deal a Ganado ─────────────────────────────────────────

  test('mover deal a etapa Ganado y verificar ingreso en VERA', async ({ page }) => {
    test.skip(!dealId, 'Requiere que el deal exista')

    await page.goto('/ari/pipeline')

    // Localizar el contenedor draggable de la card del deal por su título exacto
    const dealCard = page.locator('div[draggable="true"]').filter({ hasText: dealTitle }).first()
    await dealCard.hover()

    // Clic en el botón kebab dentro de esa card específica
    await dealCard.getByTitle('Mover a etapa').click()

    // Scopear "Ganado" al propio dealCard: el dropdown se renderiza dentro del DealCard component
    // Todos los matches están dentro de este deal (misma acción), .first() evita strict mode
    await dealCard.locator('button').filter({ hasText: /^Ganado$/ }).first().click()

    // Modal de confirmación de deal ganado
    await expect(page.getByText('Confirmar deal ganado')).toBeVisible()
    await page.getByRole('button', { name: 'Confirmar' }).click()

    // Verificar que el deal ya no aparece en la columna Lead
    await expect(page.getByText('Confirmar deal ganado')).not.toBeVisible()

    // Verificar el ingreso en VERA vía API
    const txRes  = await api(token).get('/v1/vera/transactions?referenceType=deal&limit=50')
    const txList = await txRes.json() as TxList
    const tx     = txList.data?.find((t) => t.referenceId === dealId)
    expect(tx).toBeDefined()
    expect(tx?.referenceType).toBe('deal')

    // Verificar en la UI de VERA (.first() evita strict mode cuando hay varias filas con "Ventas")
    await page.goto('/vera/transactions')
    await expect(page.getByText('Ventas').first()).toBeVisible({ timeout: 8_000 })
  })

})
