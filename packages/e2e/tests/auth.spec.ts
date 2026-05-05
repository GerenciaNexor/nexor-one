/**
 * Test 1 — Login y protección de rutas
 *
 * Verifica:
 * - Un usuario sin sesión es redirigido al login desde cualquier ruta protegida
 * - Login con credenciales incorrectas muestra mensaje de error
 * - Login exitoso lleva al dashboard
 *
 * Este test corre sin storageState (ver playwright.config.ts → auth-tests project).
 */

import { test, expect } from '@playwright/test'
import { DEMO_EMAIL, DEMO_PASSWORD } from './helpers/api'

test.describe('Autenticación y protección de rutas', () => {

  test('redirige al login cuando no hay sesión activa', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('redirige al login al intentar acceder a un módulo protegido', async ({ page }) => {
    await page.goto('/vera/transactions')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login con credenciales incorrectas muestra error', async ({ page }) => {
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 15000 })
    await page.locator('#email').fill('noexiste@nexor.co')
    await page.locator('#password').fill('contrasena-incorrecta')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('Correo o contrasena incorrectos')
  })

  test('login con email inválido muestra validación del cliente', async ({ page }) => {
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 15000 })
    await page.locator('#email').fill('no-es-un-email')
    await page.locator('#password').fill('password123')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    // La validación del cliente impide llamar al servidor
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/\/login/) // no redirige
  })

  test('login exitoso redirige al dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 15000 })
    await page.locator('#email').fill(DEMO_EMAIL)
    await page.locator('#password').fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await page.waitForURL('**/dashboard', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/dashboard/)
  })

})
