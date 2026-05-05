import { defineConfig, devices } from '@playwright/test'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

// Carga .env.local si existe (desarrollo local apuntando a Railway/local)
const envLocal = path.join(__dirname, '.env.local')
if (existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, 'utf-8').split('\n')) {
    const eq = line.indexOf('=')
    if (eq > 0 && !line.startsWith('#')) {
      const key = line.slice(0, eq).trim()
      const val = line.slice(eq + 1).trim()
      if (key && !process.env[key]) process.env[key] = val
    }
  }
}

const BASE_URL  = process.env['BASE_URL']  ?? 'http://localhost:3000'
const API_URL   = process.env['API_URL']   ?? 'http://localhost:3001'
export const AUTH_FILE = path.join(__dirname, 'playwright/.auth/user.json')

export default defineConfig({
  testDir:     './tests',
  globalSetup: './global-setup.ts',

  // Todos los tests deben completarse en menos de 10 min (62s sleep en NIRA + posible retry)
  globalTimeout: 10 * 60 * 1000,
  timeout:       30_000,
  expect:        { timeout: 10_000 },

  // Tests independientes — fallo de uno no bloquea los demás
  fullyParallel: true,
  workers:       1,
  retries:       1,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
    ...(process.env['CI'] ? [['junit', { outputFile: 'test-results/results.xml' }]] as const : []),
  ],

  use: {
    baseURL:           BASE_URL,
    screenshot:        'only-on-failure',
    video:             'retain-on-failure',
    trace:             'on-first-retry',
    // Los tests autenticados reusan el storage state guardado en global-setup
    storageState:      AUTH_FILE,
  },

  projects: [
    // Proyecto especial: autenticación sin storageState previo
    {
      name: 'auth-tests',
      testMatch: '**/auth.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        storageState: { cookies: [], origins: [] },
      },
    },
    // Suite de seguridad multi-tenant — API-only, sin browser
    {
      name: 'security',
      testMatch: '**/security.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        storageState: undefined,
      },
    },
    // Suite de documentación OpenAPI — API-only, sin browser, sin auth
    {
      name: 'openapi',
      testMatch: '**/openapi.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        storageState: undefined,
      },
    },
    // Tests funcionales con UI — usan storage state del global-setup
    {
      name: 'chromium',
      testIgnore: ['**/auth.spec.ts', '**/security.spec.ts', '**/openapi.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_FILE,
      },
    },
  ],

  // Variables de entorno disponibles en los tests
  // Acceder con process.env.BASE_URL / process.env.API_URL
})

export { BASE_URL, API_URL }
