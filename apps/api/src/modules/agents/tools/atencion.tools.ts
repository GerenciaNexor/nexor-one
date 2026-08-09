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
import { verServicios, verHorarios } from './agenda.tools'

// ─── consultar_disponibilidad ─────────────────────────────────────────────────
// Reemplazo de cara al cliente de consultar_stock_producto: nunca revela el inventario crudo.

const consultarDisponibilidad: AgentTool = {
  definition: {
    name:        'consultar_disponibilidad',
    description:
      'Consulta si un producto está disponible para la venta y su precio público, para informar o cotizar a un cliente. ' +
      'Devuelve SOLO información pública/comercial: si está disponible, el precio de venta al público, el precio de alquiler (si aplica) y las características del producto. ' +
      'NUNCA devuelve el inventario total ni por sucursal, ni el costo. ' +
      'Si el cliente indica una cantidad, informa cuánto se le puede ofrecer, LIMITADO a lo que pide (nunca el total en bodega).',
    input_schema: {
      type: 'object',
      properties: {
        producto: { type: 'string', description: 'Nombre o SKU del producto que pregunta el cliente' },
        cantidad: { type: 'number', description: 'Cantidad que el cliente quiere (opcional). Si se indica, se informa cuánto se puede ofrecer, limitado a lo pedido.' },
      },
      required: ['producto'],
    },
  },

  async execute({ producto, cantidad }, tenantId) {
    const term = String(producto ?? '').trim()
    if (!term) return { error: 'Indica el nombre o SKU del producto.' }

    const p = await prisma.product.findFirst({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { sku:  { equals: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
        ],
      },
      // Se seleccionan SOLO campos públicos. Nunca costPrice, minStock, abcClass, preferredSupplier.
      select: {
        name: true, description: true, category: true, unit: true,
        salePrice: true, rentalPrice: true, isSellable: true, isRentable: true,
        stocks: { select: { quantity: true, rentedQuantity: true } },
      },
    })

    if (!p) return { disponible: false, mensaje: `No encontré un producto que coincida con "${term}".` }

    // disponible = Σ(quantity − rentedQuantity) en todas las sucursales (HU-158).
    // Se calcula INTERNAMENTE; el total crudo NUNCA se devuelve al agente. Solo se revela un número
    // cuando el cliente pide una cantidad y hay menos ("solo puedo ofrecerte 15").
    const disponibleTotal = p.stocks.reduce(
      (s, st) => s + (Number(st.quantity) - Number(st.rentedQuantity)), 0,
    )
    const hayDisponible = disponibleTotal > 0

    const res: Record<string, unknown> = {
      producto:        p.name,
      caracteristicas: p.description ?? null,
      categoria:       p.category ?? null,
      unidad:          p.unit,
      disponible:      hayDisponible,
    }
    if (p.isSellable  && p.salePrice   != null) res['precioVenta']    = Number(p.salePrice)
    if (p.isRentable  && p.rentalPrice != null) res['precioAlquiler'] = Number(p.rentalPrice)

    // Frontera: sin cantidad → solo disponible/no disponible (nunca un número de inventario).
    // Con cantidad → cuánto se puede ofrecer, limitado a lo pedido.
    if (typeof cantidad === 'number' && cantidad > 0) {
      const puedoOfrecer = Math.max(0, Math.min(Math.floor(cantidad), Math.floor(disponibleTotal)))
      res['puedoOfrecer']      = puedoOfrecer
      res['cubreLoSolicitado'] = puedoOfrecer >= Math.floor(cantidad)
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
  consultarSucursales, // público: ubicaciones y teléfono de tienda
  registrarInteres,
]
