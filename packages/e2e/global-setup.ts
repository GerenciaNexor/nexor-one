import { chromium } from '@playwright/test'
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs'
import path from 'path'
import Redis from 'ioredis'

const API_URL     = process.env['API_URL']   ?? 'http://localhost:3001'
const BASE_URL    = process.env['BASE_URL']  ?? 'http://localhost:3000'
const AUTH_FILE   = path.join(__dirname, 'playwright/.auth/user.json')
const TOKENS_FILE = path.join(__dirname, 'playwright/.auth/tokens.json')
const MODULES     = ['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA'] as const

const TEST_EMAIL    = 'admin@demo.nexor.co'
const TEST_PASSWORD = 'Admin123!'
const B_EMAIL       = 'admin@empresa-b.nexor.co'
const B_PASSWORD    = 'AdminB456!'

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

/**
 * Aislamiento del entorno de test (HU-120, criterio 5): el bloqueo de login por IP
 * vive en Redis (HU-113) y persiste entre corridas. Para que un bloqueo de una
 * ejecución no contamine la siguiente, limpiamos las claves del limiter antes de
 * cada suite. La URL se toma de REDIS_URL o, en su defecto, del .env del backend.
 */
function resolveRedisUrl(): string | undefined {
  if (process.env['REDIS_URL']) return process.env['REDIS_URL']
  try {
    const envPath = path.join(__dirname, '../../apps/api/.env')
    const m = readFileSync(envPath, 'utf-8').match(/^REDIS_URL=["']?([^"'\n\r]+)/m)
    return m?.[1]?.trim()
  } catch {
    return undefined
  }
}

async function flushLoginLimiter(): Promise<void> {
  const url = resolveRedisUrl()
  if (!url) {
    console.log('   ⚠ REDIS_URL no disponible — se omite la limpieza del login-limiter')
    return
  }
  const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true })
  try {
    await redis.connect()
    const keys = await redis.keys('nexor:login:*')
    if (keys.length > 0) await redis.del(...keys)
    console.log(`   ✓ Login-limiter: ${keys.length} clave(s) Redis limpiadas (aislamiento de test)`)
  } catch (err) {
    console.log('   ⚠ No se pudo limpiar el login-limiter:', (err as Error).message)
  } finally {
    redis.disconnect()
  }
}

export default async function globalSetup() {
  console.log('\n🎭 Playwright global setup iniciando...')

  // ── 0. Aislamiento: limpiar el bloqueo de login en Redis entre corridas ────
  await flushLoginLimiter()

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

  // ── 4. Obtener token Tenant B y persistir ambos para los workers ─────────────
  // Los workers E2E (fullyParallel) no heredan process.env del setup.
  // Guardamos los tokens en disco para que cada beforeAll los lea sin llamar login().
  const loginB  = await apiPost('/v1/auth/login', { email: B_EMAIL, password: B_PASSWORD })
  const tokenB  = (loginB['token'] as string) || ''
  const dir = path.dirname(AUTH_FILE)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(TOKENS_FILE, JSON.stringify({ tokenA: token, tokenB }, null, 2))
  console.log('   ✓ Tokens guardados en', TOKENS_FILE)

  // ── 5. Login vía UI y guardar storageState ────────────────────────────────
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
