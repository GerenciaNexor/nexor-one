/**
 * Utilidades para documentación OpenAPI con @fastify/swagger.
 *
 * Los schemas generados por z2j son SOLO para documentación.
 * La validación real la hace Zod directamente en los handlers.
 */

import { zodToJsonSchema } from 'zod-to-json-schema'
import type { ZodTypeAny } from 'zod'

/** Convierte un Zod schema a JSON Schema (inline, sin $ref externos). */
export function z2j(schema: ZodTypeAny): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = zodToJsonSchema as any
  return fn(schema, { $refStrategy: 'none', errorMessages: false }) as Record<string, unknown>
}

/** Referencia de seguridad Bearer JWT para incluir en cada ruta protegida. */
export const bearerAuth: Array<Record<string, string[]>> = [{ bearerAuth: [] }]

/** Schema de error estándar (4xx / 5xx). */
export const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string', example: 'Descripción del error' },
    code:  { type: 'string', example: 'ERROR_CODE' },
  },
  required: ['error', 'code'],
}

/** Respuesta de objeto genérico (additionalProperties para no perder campos). */
export const objRes = { type: 'object', additionalProperties: true }

/** Respuesta de lista con data[] + total. */
export const listRes = {
  type: 'object',
  properties: {
    data:  { type: 'array', items: { type: 'object', additionalProperties: true } },
    total: { type: 'integer' },
  },
  additionalProperties: true,
}

/** Parámetro de path :id estándar (UUID). */
export const idParam = {
  type: 'object',
  properties: { id: { type: 'string', format: 'uuid', description: 'UUID del recurso' } },
  required: ['id'],
}

/** Respuestas de error comunes. Añadir al `response` de cada ruta. */
export const stdErrors = {
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  500: errorSchema,
}
