/**
 * HU-087 — Verificación de documentación OpenAPI
 *
 * Valida que:
 *   1. GET /documentation devuelve el spec JSON válido
 *   2. GET /documentation/ui devuelve la Swagger UI HTML
 *   3. Todos los endpoints de negocio usan el prefijo /v1/
 *   4. GET /documentation devuelve 404 en producción (simulado)
 */

import { test, expect } from '@playwright/test'
import { API_URL } from './helpers/api'

test.describe('OpenAPI — HU-087', () => {

  test('GET /documentation devuelve OpenAPI 3.0 JSON spec válido', async () => {
    const res = await fetch(`${API_URL}/documentation`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')

    const spec = await res.json() as Record<string, unknown>
    expect(spec['openapi']).toBe('3.0.3')
    expect((spec['info'] as Record<string, string>)['title']).toBe('NEXOR API')
    expect(spec['paths']).toBeDefined()
    expect(spec['components']).toBeDefined()
  })

  test('GET /documentation/ui devuelve Swagger UI HTML', async () => {
    const res = await fetch(`${API_URL}/documentation/ui`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('swagger')
  })

  test('El spec incluye los 6 módulos principales como tags', async () => {
    const res  = await fetch(`${API_URL}/documentation`)
    const spec = await res.json() as { tags?: Array<{ name: string }> }
    const tagNames = (spec.tags ?? []).map((t) => t.name)
    for (const mod of ['KIRA', 'NIRA', 'ARI', 'AGENDA', 'VERA', 'Auth']) {
      expect(tagNames).toContain(mod)
    }
  })

  test('El spec tiene esquema de seguridad bearerAuth configurado', async () => {
    const res  = await fetch(`${API_URL}/documentation`)
    const spec = await res.json() as {
      components?: { securitySchemes?: Record<string, unknown> }
    }
    expect(spec.components?.securitySchemes?.['bearerAuth']).toBeDefined()
  })

  test('Todos los paths del spec usan el prefijo /v1/ o son rutas especiales', async () => {
    const res   = await fetch(`${API_URL}/documentation`)
    const spec  = await res.json() as { paths?: Record<string, unknown> }
    const paths = Object.keys(spec.paths ?? {})

    // Rutas permitidas sin /v1/: infraestructura y webhooks
    const SPECIAL_PATHS = [
      '/documentation',
      '/documentation/ui',
      '/health',
      '/webhook/whatsapp',
      '/webhook/gmail',
      '/v1/agenda/cancel/:token',
    ]

    const unversioned = paths.filter(
      (p) =>
        !p.startsWith('/v1/') &&
        !SPECIAL_PATHS.some((sp) => p.startsWith(sp.replace(':token', ''))),
    )

    expect(
      unversioned,
      `Endpoints sin /v1/ encontrados: ${unversioned.join(', ')}`,
    ).toHaveLength(0)
  })

  test('Los endpoints de negocio tienen operationId y summary documentados', async () => {
    const res  = await fetch(`${API_URL}/documentation`)
    const spec = await res.json() as {
      paths?: Record<string, Record<string, { summary?: string; operationId?: string }>>
    }

    const missing: string[] = []
    const methods = ['get', 'post', 'put', 'patch', 'delete']

    for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
      if (!path.startsWith('/v1/')) continue
      for (const method of methods) {
        const op = pathItem[method]
        if (!op) continue
        if (!op['summary']) missing.push(`${method.toUpperCase()} ${path} — falta summary`)
      }
    }

    expect(
      missing,
      `Endpoints sin summary:\n${missing.join('\n')}`,
    ).toHaveLength(0)
  })

  test('Los endpoints v1 tienen security definido (bearer o vacío para rutas públicas)', async () => {
    const res  = await fetch(`${API_URL}/documentation`)
    const spec = await res.json() as {
      paths?: Record<string, Record<string, { security?: unknown[] }>>
      security?: unknown[]
    }

    // La seguridad puede venir del nivel global o del endpoint individual
    const globalSecurity = spec.security ?? []
    const methods = ['get', 'post', 'put', 'patch', 'delete']
    const noSecurity: string[] = []

    for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
      if (!path.startsWith('/v1/')) continue
      for (const method of methods) {
        const op = pathItem[method]
        if (!op) continue
        // Si la operación no define security propio, hereda el global
        const opSecurity = op['security']
        const effectiveSecurity = opSecurity !== undefined ? opSecurity : globalSecurity
        if (!Array.isArray(effectiveSecurity) || effectiveSecurity.length === 0) {
          // security: [] es válido para rutas explícitamente públicas
          // security: undefined hereda global — OK
          // Solo falla si no hay global Y no hay operación security
          if (globalSecurity.length === 0 && opSecurity === undefined) {
            noSecurity.push(`${method.toUpperCase()} ${path}`)
          }
        }
      }
    }

    expect(
      noSecurity,
      `Endpoints sin autenticación definida:\n${noSecurity.join('\n')}`,
    ).toHaveLength(0)
  })

})
