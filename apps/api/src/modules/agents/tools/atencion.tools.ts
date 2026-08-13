/**
 * Tools del agente de ATENCIÓN al cliente (canales externos: WhatsApp/Gmail) — HU-180.
 *
 * FRONTERA DE INFORMACIÓN (segundo nivel de aislamiento, tan estricto como el multi-tenant):
 * estas tools son la línea de defensa DETERMINISTA. Solo devuelven información pública/comercial;
 * NUNCA exponen datos internos aunque el prompt fuese manipulado (defensa en profundidad).
 *
 * SÍ se puede revelar:  disponibilidad (sí/no), cuánto se puede ofrecer (limitado a lo pedido),
 *                       precio de venta al público, características del producto, sucursales,
 *                       servicios y horarios LIBRES.
 * NUNCA se revela:      costo/precio de compra, márgenes, inventario total/por sucursal de forma
 *                       espontánea, datos de empleados, de otros clientes o terceros, de
 *                       proveedores, finanzas, ni detalles de citas (con quién / de qué).
 *
 * Por eso el agente de atención NO usa `consultar_stock_producto` (expone el stock total y por
 * sucursal) ni las EMPRESA_TOOLS en bloque (`consultar_usuarios` expone empleados). Reutiliza solo
 * tools públicas: consultar_sucursales, ver_servicios y ver_horarios (que devuelven solo horarios
 * libres, sin detalles de la cita).
 */

import { prisma } from '../../../lib/prisma'
import type { AgentTool } from '../types'
import { consultarSucursales } from './empresa.tools'
import { verServicios, verHorarios, crearCita } from './agenda.tools'

/** Minúsculas + sin acentos — para buscar productos sin importar tildes ni mayúsculas. */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/** Singulariza una palabra en español (monitores→monitor, cables→cable) para tolerar plural/singular. */
function singular(w: string): string {
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s'))  return w.slice(0, -1)
  return w
}

/** Palabras normalizadas + singularizadas de un texto, para un matching tolerante. */
function searchWords(s: string): string[] {
  return normalize(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 2).map(singular)
}

/** ¿Coinciden dos palabras? exacta, o una prefijo/incluida en la otra (mín. 3 chars para evitar ruido). */
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.min(a.length, b.length) < 3) return false
  return a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a)
}

// ─── consultar_disponibilidad ─────────────────────────────────────────────────
// Reemplazo de cara al cliente de consultar_stock_producto: nunca revela el inventario crudo.

const consultarDisponibilidad: AgentTool = {
  definition: {
    name:        'consultar_disponibilidad',
    description:
      'Consulta el catálogo para informar disponibilidad y precio público a un cliente (o listar qué referencias hay que coincidan con lo que pregunta). ' +
      'Devuelve SOLO información pública/comercial: si está disponible, el precio de venta al público, el precio de alquiler (si aplica), las características, y una lista de referencias que coinciden. ' +
      'NUNCA devuelve el inventario total ni por sucursal, ni el costo. La búsqueda ignora tildes y mayúsculas. ' +
      'Si el cliente indica una cantidad, informa cuánto se le puede ofrecer, LIMITADO a lo que pide (nunca el total en bodega).',
    input_schema: {
      type: 'object',
      properties: {
        producto: { type: 'string', description: 'Nombre, tipo o SKU de lo que pregunta el cliente (ej. "audífonos"). Puede ser general.' },
        cantidad: { type: 'number', description: 'Cantidad que el cliente quiere (opcional). Si se indica, se informa cuánto se puede ofrecer, limitado a lo pedido.' },
      },
      required: ['producto'],
    },
  },

  async execute({ producto, cantidad }, tenantId) {
    const raw = String(producto ?? '').trim()
    if (!raw) return { error: 'Indica el nombre o SKU del producto.' }
    const term      = normalize(raw)
    const termWords = searchWords(raw)   // singularizadas: "monitores" → ["monitor"]

    // Se traen los productos vendibles/alquilables del tenant (acotado) y se busca SIN acentos y por
    // palabras singularizadas — así "monitores" encuentra "Monitor 27\" 144Hz" y "audifonos"
    // encuentra "Audífonos diadema". Solo campos PÚBLICOS (nunca costPrice, minStock, etc.).
    const products = await prisma.product.findMany({
      where:  { tenantId, isActive: true, OR: [{ isSellable: true }, { isRentable: true }] },
      take:   1000,
      select: {
        name: true, sku: true, description: true, category: true, unit: true,
        salePrice: true, rentalPrice: true, isSellable: true, isRentable: true,
        stocks: { select: { quantity: true, rentedQuantity: true } },
      },
    })
    if (products.length === 0) return { disponible: false, mensaje: 'Aún no hay productos en el catálogo.' }

    const scored = products
      .map((p) => {
        const n = normalize(p.name), sku = normalize(p.sku)
        // Palabras buscables del producto: nombre + categoría (para términos generales).
        const hay = searchWords(`${p.name} ${p.category ?? ''}`)
        let score = 0
        if (sku === term || n === term)   score = 100
        else if (n.includes(term))        score = 80
        else {
          // Coincidencia por palabras singularizadas (tolera plural/singular, parcial y categoría).
          const hits = termWords.filter((tw) => hay.some((hw) => wordsMatch(tw, hw))).length
          score = hits > 0 ? 40 + hits * 20 : 0
        }
        return { p, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)

    if (scored.length === 0) return { disponible: false, mensaje: `No encontré un producto que coincida con "${raw}".` }

    // disponible = Σ(quantity − rentedQuantity) en todas las sucursales (HU-158). Se calcula
    // INTERNAMENTE; el total crudo NUNCA se devuelve. Solo se revela un número con el "cap" por pedido.
    const disponibleDe = (p: (typeof products)[number]) =>
      p.stocks.reduce((s, st) => s + (Number(st.quantity) - Number(st.rentedQuantity)), 0)

    const top = scored[0]!.p
    const disponibleTotal = disponibleDe(top)

    const res: Record<string, unknown> = {
      producto:        top.name,
      caracteristicas: top.description ?? null,
      categoria:       top.category ?? null,
      unidad:          top.unit,
      disponible:      disponibleTotal > 0,
    }
    if (top.isSellable && top.salePrice   != null) res['precioVenta']    = Number(top.salePrice)
    if (top.isRentable && top.rentalPrice != null) res['precioAlquiler'] = Number(top.rentalPrice)

    // Con cantidad → cuánto se puede ofrecer, limitado a lo pedido (nunca el total en bodega).
    if (typeof cantidad === 'number' && cantidad > 0) {
      const puedoOfrecer = Math.max(0, Math.min(Math.floor(cantidad), Math.floor(disponibleTotal)))
      res['puedoOfrecer']      = puedoOfrecer
      res['cubreLoSolicitado'] = puedoOfrecer >= Math.floor(cantidad)
    }

    // Referencias que coinciden (para "¿qué tienes?"): nombre + precio público + disponible sí/no.
    // NUNCA cantidades — respeta la frontera de información.
    if (scored.length > 1) {
      res['coincidencias'] = scored.slice(0, 6).map(({ p }) => ({
        producto:   p.name,
        disponible: disponibleDe(p) > 0,
        ...(p.isSellable && p.salePrice != null ? { precioVenta: Number(p.salePrice) } : {}),
      }))
    }

    return res
  },
}

// ─── registrar_interes ────────────────────────────────────────────────────────
// El agente NO cierra la venta: captura el interés y deriva a un asesor humano.

const registrarInteres: AgentTool = {
  definition: {
    name:        'registrar_interes',
    description:
      'Registra el interés/solicitud del cliente y avisa al equipo humano del negocio para que un asesor lo contacte y cierre la venta. ' +
      'Úsala cuando el cliente muestra intención de compra o pide avanzar con un pedido. TÚ NO cierras la venta: derivas a una persona.',
    input_schema: {
      type: 'object',
      properties: {
        nombre:   { type: 'string', description: 'Nombre del cliente si lo dio (si no, omítelo)' },
        contacto: { type: 'string', description: 'Teléfono o correo del cliente para contactarlo' },
        interes:  { type: 'string', description: 'Qué quiere el cliente (producto/servicio y cantidad)' },
        mensaje:  { type: 'string', description: 'Resumen breve de lo que pidió el cliente' },
      },
      required: ['contacto', 'interes'],
    },
  },

  async execute({ nombre, contacto, interes, mensaje }, tenantId) {
    const contact = String(contacto ?? '').trim()
    if (!contact) return { error: 'Falta el contacto del cliente.' }
    const isEmail = contact.includes('@')
    const displayName = String(nombre ?? '').trim() || 'Cliente'

    // Upsert de cliente. NO se revela si ya existía (frontera: no confirmar quién es cliente).
    const existing = await prisma.client.findFirst({
      where:  { tenantId, OR: [{ phone: contact }, { whatsappId: contact }, { email: contact }] },
      select: { id: true },
    })
    const clientId = existing?.id ?? (await prisma.client.create({
      data: {
        tenantId,
        name:   displayName,
        source: isEmail ? 'gmail' : 'whatsapp',
        tags:   ['lead-atencion'],
        ...(isEmail ? { email: contact } : { phone: contact, whatsappId: contact }),
      },
      select: { id: true },
    })).id

    // Deal en la primera etapa del pipeline (si hay pipeline configurado).
    const firstStage = await prisma.pipelineStage.findFirst({
      where: { tenantId }, orderBy: { order: 'asc' }, select: { id: true },
    })
    if (firstStage) {
      await prisma.deal.create({
        data: { tenantId, clientId, stageId: firstStage.id, title: `Atención — ${String(interes).slice(0, 100)}` },
      }).catch(() => null)
    }

    // Notificar al equipo comercial humano (AREA_MANAGER de ARI + TENANT_ADMIN).
    try {
      const managers = await prisma.user.findMany({
        where:  { tenantId, isActive: true, OR: [{ role: 'AREA_MANAGER', module: 'ARI' }, { role: 'TENANT_ADMIN' }] },
        select: { id: true },
      })
      if (managers.length > 0) {
        await prisma.notification.createMany({
          data: managers.map((m) => ({
            tenantId,
            userId:  m.id,
            module:  'ARI' as const,
            type:    'nuevo_lead',
            title:   `Interés de cliente por atención — ${displayName}`,
            message: `Contacto: ${contact}. Interés: "${String(interes).slice(0, 160)}".${mensaje ? ` Mensaje: "${String(mensaje).slice(0, 160)}".` : ''} Contáctalo para cerrar.`,
            link:    '/ari',
          })),
        })
      }
    } catch {
      // Una falla en notificaciones nunca revierte el registro del interés.
    }

    // Respuesta NEUTRA: nada de ids internos, vendedor asignado ni si ya era cliente.
    return { registrado: true, mensaje: 'Listo, un asesor del equipo lo contactará para avanzar.' }
  },
}

// ─── Catálogo ATENCIÓN ────────────────────────────────────────────────────────
// Autosuficiente: NO se le añaden las EMPRESA_TOOLS en bloque (evita consultar_usuarios).
export const ATENCION_TOOLS: AgentTool[] = [
  consultarDisponibilidad,
  verServicios,        // público: catálogo de servicios (nombre, precio, duración)
  verHorarios,         // solo horarios LIBRES (sin detalles de la cita)
  crearCita,           // HU-195 — agenda la cita directamente en un horario libre (sin pisar citas)
  consultarSucursales, // público: ubicaciones y teléfono de tienda
  registrarInteres,
]
