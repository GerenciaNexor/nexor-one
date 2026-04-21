import { chromium } from '@playwright/test'
import { mkdirSync, existsSync } from 'fs'
import path from 'path'

const API_URL   = process.env['API_URL']   ?? 'http://localhost:3001'
const BASE_URL  = process.env['BASE_URL']  ?? 'http://localhost:3000'
const AUTH_FILE = path.join(__dirname, 'playwright/.auth/user.json')
const MODULES   = ['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA'] as const

const TEST_EMAIL    = 'admin@demo.nexor.co'
const TEST_PASSWORD = 'Admin123!'

async function apiPost(path: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API_URL}${path}`, {
    method:  'POST',
    headers,
    body:    JSON.stringify(body),
  })
  return res.json() as Promise<Record<string, unknown>>
}

async function apiPut(path: string, body: unknown, token: string) {
  await fetch(`${API_URL}${path}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify(body),
  })
}

async function apiGet(path: string, token: string) {
  await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export default async function globalSetup() {
  console.log('\n🎭 Playwright global setup iniciando...')

  // ── 1. Login vía API para obtener token ───────────────────────────────────
  const loginData = await apiPost('/v1/auth/login', { email: TEST_EMAIL, password: TEST_PASSWORD })
  const token = loginData['token'] as string
  if (!token) throw new Error('Global setup: login falló — verifica que la API esté corriendo y la BD sembrada')

  // ── 2. Habilitar todos los módulos para el tenant demo ────────────────────
  for (const mod of MODULES) {
    await apiPut('/v1/tenants/feature-flags', { module: mod, enabled: true }, token)
  }
  console.log('   ✓ Módulos habilitados (ARI, NIRA, KIRA, AGENDA, VERA)')

  // ── 3. Disparar seedDefaults de categorías VERA ───────────────────────────
  // listCategories auto-crea las 5 categorías por defecto si no existen
  await apiGet('/v1/vera/categories', token)
  console.log('   ✓ Categorías VERA aseguradas')

  // ── 4. Almacenar token para tests de API ──────────────────────────────────
  process.env['E2E_TOKEN'] = token

  // ── 5. Login vía UI y guardar storageState ────────────────────────────────
  const dir = path.dirname(AUTH_FILE)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const browser = await chromium.launch()
  const page    = await browser.newPage()

  await page.goto(`${BASE_URL}/login`)
  await page.locator('#email').fill(TEST_EMAIL)
  await page.locator('#password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.waitForURL('**/dashboard', { timeout: 15_000 })
  await page.context().storageState({ path: AUTH_FILE })

  await browser.close()
  console.log('   ✓ Storage state guardado en', AUTH_FILE)
  console.log('🎭 Global setup completado.\n')
}
