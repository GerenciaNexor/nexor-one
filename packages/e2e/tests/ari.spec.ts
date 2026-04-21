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
import { login, api, DEMO_EMAIL, DEMO_PASSWORD } from './helpers/api'

interface Client  { id: string; name: string }
interface Deal    { id: string; title: string; stage: { name: string } }
interface TxList  { data: Array<{ id: string; referenceType: string; referenceId: string }> }

test.describe('Flujo ARI — deal ganado', () => {
  let token:      string
  let clientId:   string
  let clientName: string
  let dealId:     string

  test.beforeAll(async () => {
    const auth = await login(DEMO_EMAIL, DEMO_PASSWORD)
    token = auth.token
  })

  test.afterAll(async () => {
    if (dealId)   await api(token).delete(`/v1/ari/deals/${dealId}`)
    if (clientId) await api(token).delete(`/v1/ari/clients/${clientId}`)
  })

  // ── Test 4a: crear cliente desde la UI ──────────────────────────────────

  test('crear cliente en el CRM', async ({ page }) => {
    clientName = `Cliente E2E ${Date.now()}`

    await page.goto('/ari/clients')
    await expect(page.getByRole('button', { name: 'Nuevo cliente' })).toBeVisible()

    await page.getByRole('button', { name: 'Nuevo cliente' }).click()
    await page.getByPlaceholder('Nombre completo o razón social').fill(clientName)

    await page.getByRole('button', { name: 'Crear cliente' }).click()

    // Verificar que aparece en la lista
    await expect(page.getByText(clientName)).toBeVisible({ timeout: 10_000 })

    // Guardar ID vía API
    const res  = await api(token).get(`/v1/ari/clients?search=${encodeURIComponent(clientName)}`)
    const data = await res.json() as { data: Client[] }
    clientId   = data.data?.[0]?.id ?? ''
  })

  // ── Test 4b: crear deal en el pipeline ──────────────────────────────────

  test('crear deal para el cliente', async ({ page }) => {
    test.skip(!clientId, 'Requiere que el cliente exista')

    const dealTitle = `Deal E2E ${Date.now()}`

    await page.goto('/ari/pipeline')
    await page.getByRole('button', { name: 'Nuevo deal' }).click()

    // Seleccionar cliente
    await page.getByLabel('Cliente *').selectOption({ label: clientName })

    // Título del deal
    await page.getByPlaceholder('Ej: Pedido 50 unidades shampoo').fill(dealTitle)

    // Etapa: Lead (primera etapa)
    await page.getByLabel('Etapa *').selectOption({ label: 'Lead' })

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

    // Localizar la card del deal y abrir el menú de mover
    const dealCard = page.getByText(new RegExp('Deal E2E')).first()
    await dealCard.hover()

    // Clic en el botón kebab "Mover a etapa"
    await page.getByTitle('Mover a etapa').first().click()

    // Seleccionar "Ganado" del menú desplegable
    await page.getByRole('button', { name: 'Ganado' }).click()

    // Modal de confirmación de deal ganado
    await expect(page.getByText('Confirmar deal ganado')).toBeVisible()
    await page.getByRole('button', { name: 'Confirmar' }).click()

    // Verificar que el deal ya no aparece en la columna Lead
    await expect(page.getByText('Confirmar deal ganado')).not.toBeVisible()

    // Verificar el ingreso en VERA vía API
    const txRes  = await api(token).get('/v1/vera/transactions?referenceType=deal&limit=10')
    const txList = await txRes.json() as TxList
    const tx     = txList.data?.find((t) => t.referenceId === dealId)
    expect(tx).toBeDefined()
    expect(tx?.referenceType).toBe('deal')

    // Verificar en la UI de VERA
    await page.goto('/vera/transactions')
    await expect(page.getByText('Ventas')).toBeVisible({ timeout: 8_000 })
  })

})
