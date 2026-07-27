/**
 * HU-143 — Límites del plan DEMO, validados en el BACKEND.
 *
 * Lección de HU-128: los topes se imponen en el servidor, no ocultando botones en el frontend.
 * Un tenant en modo demo (`tenants.is_demo`, HU-142) no puede superar estos topes; al alcanzarlos
 * la API rechaza la creación con un mensaje claro (`DEMO_LIMIT_REACHED`). La carga masiva —la
 * puerta trasera para saltarse los topes— queda deshabilitada en demo (`DEMO_BULK_UPLOAD_DISABLED`).
 *
 * Los límites viven en UN solo lugar (`DEMO_LIMITS`), no dispersos ni hardcodeados por módulo.
 * Se afloja en datos (no cuestan); la IA se aprieta aparte (HU-144).
 *
 * Todas las consultas usan el proxy `prisma` (consciente del request): dentro de la transacción
 * por-request del tenant, `count`/`findUnique` comparten conexión y contexto RLS.
 */
import { prisma } from './prisma'

/** Topes de cantidad del plan demo. Configurable en un único punto. */
export const DEMO_LIMITS = {
  products:       40,
  clients:        25,
  suppliers:      10,
  quotes:         25, // "ventas/cotizaciones"
  purchaseOrders: 15,
  users:          3,
  appointments:   25,
} as const

export type DemoLimitedEntity = keyof typeof DEMO_LIMITS

/** Etiqueta legible (español) por entidad, para los mensajes de la API y el frontend. */
export const DEMO_LIMIT_LABEL: Record<DemoLimitedEntity, string> = {
  products:       'productos',
  clients:        'clientes',
  suppliers:      'proveedores',
  quotes:         'ventas/cotizaciones',
  purchaseOrders: 'órdenes de compra',
  users:          'usuarios',
  appointments:   'citas',
}

/** Cuenta el uso actual de una entidad dentro del tenant (RLS vía proxy por-request). */
async function countEntity(tenantId: string, e: DemoLimitedEntity): Promise<number> {
  switch (e) {
    case 'products':       return prisma.product.count({ where: { tenantId } })
    case 'clients':        return prisma.client.count({ where: { tenantId } })
    case 'suppliers':      return prisma.supplier.count({ where: { tenantId } })
    case 'quotes':         return prisma.quote.count({ where: { tenantId } })
    case 'purchaseOrders': return prisma.purchaseOrder.count({ where: { tenantId } })
    case 'users':          return prisma.user.count({ where: { tenantId } })
    case 'appointments':   return prisma.appointment.count({ where: { tenantId } })
  }
}

/** ¿El tenant está en modo demo? (`tenants` es raíz sin RLS; lectura segura por id.) */
async function isDemoTenant(tenantId: string): Promise<boolean> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { isDemo: true } })
  return !!t?.isDemo
}

/**
 * Lanza `403 DEMO_LIMIT_REACHED` si el tenant es demo y ya alcanzó el tope de la entidad.
 * No hace nada para tenants normales (el plan completo no tiene estos topes). Llamar SIEMPRE
 * en el service, justo antes del INSERT.
 */
export async function assertDemoLimit(tenantId: string, entity: DemoLimitedEntity): Promise<void> {
  if (!(await isDemoTenant(tenantId))) return
  const limit = DEMO_LIMITS[entity]
  const used = await countEntity(tenantId, entity)
  if (used >= limit) {
    throw {
      statusCode: 403,
      code: 'DEMO_LIMIT_REACHED',
      message: `Plan demo: alcanzaste el límite de ${limit} ${DEMO_LIMIT_LABEL[entity]}. Convierte tu cuenta a un plan completo para seguir agregando.`,
    }
  }
}

/**
 * HU-143 — La carga masiva es la puerta trasera de los topes: deshabilitada en demo.
 * Lanza `403 DEMO_BULK_UPLOAD_DISABLED`. Llamar al inicio de los endpoints de carga masiva.
 */
export async function assertBulkUploadAllowed(tenantId: string): Promise<void> {
  if (await isDemoTenant(tenantId)) {
    throw {
      statusCode: 403,
      code: 'DEMO_BULK_UPLOAD_DISABLED',
      message: 'Plan demo: la carga masiva está deshabilitada. Agrega los registros de muestra manualmente, respetando los límites del plan.',
    }
  }
}

export interface DemoUsageEntry { limit: number; used: number; remaining: number }

/**
 * Uso actual vs. límites del tenant (para el frontend: "12 de 40 productos"). Para tenants
 * normales devuelve `{ isDemo: false }`. Cuenta secuencialmente (una tx interactiva = una conexión).
 */
export async function getDemoUsage(tenantId: string) {
  const t = await prisma.tenant.findUnique({
    where:  { id: tenantId },
    select: { isDemo: true, demoStartedAt: true, demoEndedAt: true },
  })
  if (!t?.isDemo) return { isDemo: false as const }

  const usage: Record<string, DemoUsageEntry> = {}
  for (const e of Object.keys(DEMO_LIMITS) as DemoLimitedEntity[]) {
    const used = await countEntity(tenantId, e)
    usage[e] = { limit: DEMO_LIMITS[e], used, remaining: Math.max(0, DEMO_LIMITS[e] - used) }
  }

  const now = Date.now()
  const end = t.demoEndedAt ? t.demoEndedAt.getTime() : null
  return {
    isDemo:            true as const,
    status:            end !== null && end > now ? ('active' as const) : ('expired' as const),
    daysRemaining:     end === null ? 0 : Math.max(0, Math.ceil((end - now) / 86_400_000)),
    startedAt:         t.demoStartedAt,
    endedAt:           t.demoEndedAt,
    bulkUploadEnabled: false,
    labels:            DEMO_LIMIT_LABEL,
    usage,
  }
}
