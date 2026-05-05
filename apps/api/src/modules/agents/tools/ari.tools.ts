/**
 * Tools del agente ARI — CRM y Ventas
 * HU-061: buscar_cliente, crear_lead, consultar_stock_producto, notificar_vendedor.
 *
 * Reglas inamovibles:
 *   - buscar_cliente es siempre el primer paso antes de crear un lead.
 *   - crear_lead crea cliente Y deal en la misma transacción Prisma — nunca uno sin el otro.
 *   - La notificación al vendedor es obligatoria al crear un lead.
 *   - consultar_stock_producto es de SOLO LECTURA — ARI nunca modifica inventario.
 */

import { prisma } from '../../../lib/prisma'
import type { AgentTool } from '../types'

// ─── buscar_cliente ───────────────────────────────────────────────────────────

const buscarCliente: AgentTool = {
  definition: {
    name:        'buscar_cliente',
    description: 'Searches for an existing client by phone or WhatsApp number. Returns name, assigned salesperson and last active deal. ALWAYS call this before crear_lead to avoid duplicates.',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Phone or WhatsApp number to search (with or without country code)' },
      },
      required: ['phone'],
    },
  },

  async execute({ phone }, tenantId) {
    const normalizedPhone = (phone as string).trim()

    const client = await prisma.client.findFirst({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { phone:      normalizedPhone },
          { whatsappId: normalizedPhone },
        ],
      },
      select: {
        id:           true,
        name:         true,
        email:        true,
        phone:        true,
        whatsappId:   true,
        company:      true,
        source:       true,
        assignedUser: { select: { id: true, name: true } },
        deals: {
          where:   { stage: { isFinalWon: false, isFinalLost: false } },
          select:  { id: true, title: true, stage: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take:    1,
        },
      },
    })

    if (!client) {
      return { existe: false, mensaje: `No se encontró cliente con número "${normalizedPhone}".` }
    }

    return {
      existe:             true,
      clienteId:          client.id,
      nombre:             client.name,
      empresa:            client.company ?? null,
      email:              client.email ?? null,
      vendedor:           client.assignedUser
        ? { id: client.assignedUser.id, nombre: client.assignedUser.name }
        : null,
      ultimoDealActivo:   client.deals[0]
        ? { id: client.deals[0].id, titulo: client.deals[0].title, etapa: client.deals[0].stage.name }
        : null,
    }
  },
}

// ─── crear_lead ───────────────────────────────────────────────────────────────

const crearLead: AgentTool = {
  definition: {
    name:        'crear_lead',
    description: 'Creates a new lead: registers the client AND a deal in the first pipeline stage atomically, logs the initial WhatsApp interaction, and notifies the assigned salesperson (or all ARI area managers if none is assigned). Always call buscar_cliente first.',
    input_schema: {
      type: 'object',
      properties: {
        nombre:          { type: 'string', description: 'Full name of the lead' },
        whatsappNumber:  { type: 'string', description: 'WhatsApp phone number (with country code)' },
        intencion:       { type: 'string', description: 'Detected intent, e.g. "pregunta por Omeprazol 500mg"' },
        mensajeOriginal: { type: 'string', description: 'Original first message from the client — stored in the interaction log' },
      },
      required: ['nombre', 'whatsappNumber', 'intencion', 'mensajeOriginal'],
    },
  },

  async execute({ nombre, whatsappNumber, intencion, mensajeOriginal }, tenantId) {
    const phone = (whatsappNumber as string).trim()

    // ── Dedup check — el agente nunca crea duplicados ─────────────────────────
    const existing = await prisma.client.findFirst({
      where: {
        tenantId,
        OR: [
          { phone:      phone },
          { whatsappId: phone },
        ],
      },
      select: { id: true, name: true },
    })

    if (existing) {
      return {
        error:     'CLIENTE_EXISTENTE',
        mensaje:   `El número ${phone} ya está registrado como cliente "${existing.name}" (id: ${existing.id}). No se creó duplicado.`,
        clienteId: existing.id,
      }
    }

    // ── Primera etapa del pipeline ────────────────────────────────────────────
    const firstStage = await prisma.pipelineStage.findFirst({
      where:   { tenantId },
      orderBy: { order: 'asc' },
      select:  { id: true, name: true },
    })

    if (!firstStage) {
      return {
        error:   'SIN_PIPELINE',
        mensaje: 'No hay etapas de pipeline configuradas. Un administrador debe configurarlas primero.',
      }
    }

    // ── Vendedor disponible (primer OPERATIVE de ARI) ─────────────────────────
    const salesRep = await prisma.user.findFirst({
      where:   { tenantId, role: 'OPERATIVE', module: 'ARI', isActive: true },
      select:  { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    })

    // ── Transacción atómica: cliente + deal + interacción ─────────────────────
    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          tenantId,
          name:       nombre as string,
          whatsappId: phone,
          phone:      phone,
          source:     'whatsapp',
          tags:       ['lead-agente'],
          assignedTo: salesRep?.id ?? null,
        },
        select: { id: true, name: true, assignedTo: true },
      })

      const deal = await tx.deal.create({
        data: {
          tenantId,
          clientId:  client.id,
          stageId:   firstStage.id,
          title:     `Lead WhatsApp — ${String(nombre).slice(0, 100)}`,
          assignedTo: client.assignedTo,
        },
        select: { id: true, title: true },
      })

      // Interacción inicial — userId null identifica al agente
      await tx.interaction.create({
        data: {
          tenantId,
          clientId:  client.id,
          dealId:    deal.id,
          userId:    null,
          type:      'whatsapp',
          direction: 'inbound',
          content:   mensajeOriginal as string,
        },
      })

      return { client, deal }
    })

    // ── Notificación al vendedor — obligatoria por regla de negocio ───────────
    try {
      const assignedTo = result.client.assignedTo

      if (assignedTo) {
        await prisma.notification.create({
          data: {
            tenantId,
            userId:  assignedTo,
            module:  'ARI',
            type:    'nuevo_lead',
            title:   `Nuevo lead — ${String(nombre)}`,
            message: `El agente recibió un mensaje en WhatsApp. Intención: "${String(intencion).slice(0, 150)}". Mensaje original: "${String(mensajeOriginal).slice(0, 200)}".`,
            link:    `/ari/clients/${result.client.id}`,
          },
        })
      } else {
        // Sin vendedor → notificar a todos los AREA_MANAGER de ARI
        const managers = await prisma.user.findMany({
          where: {
            tenantId,
            OR: [
              { role: 'AREA_MANAGER', module: 'ARI' },
              { role: 'TENANT_ADMIN' },
            ],
          },
          select: { id: true },
        })

        await prisma.notification.createMany({
          data: managers.map((u) => ({
            tenantId,
            userId:  u.id,
            module:  'ARI' as const,
            type:    'nuevo_lead',
            title:   `Nuevo lead sin asignar — ${String(nombre)}`,
            message: `El agente registró un lead desde WhatsApp sin vendedor disponible. Intención: "${String(intencion).slice(0, 150)}". Asígnalo manualmente.`,
            link:    `/ari/clients/${result.client.id}`,
          })),
        })
      }
    } catch {
      // Una falla en notificaciones nunca revierte la creación del lead
    }

    return {
      success:    true,
      clienteId:  result.client.id,
      dealId:     result.deal.id,
      nombre:     result.client.name,
      whatsapp:   phone,
      etapa:      firstStage.name,
      vendedor:   salesRep ? salesRep.name : null,
      mensaje:    `Lead creado. Cliente y deal registrados en etapa "${firstStage.name}".`,
    }
  },
}

// ─── consultar_stock_producto ─────────────────────────────────────────────────

const consultarStockProducto: AgentTool = {
  definition: {
    name:        'consultar_stock_producto',
    description: 'Queries KIRA inventory to check stock availability by product name or SKU. Read-only — ARI cannot modify inventory. Use before quoting to confirm availability.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Product name or partial name' },
        sku:    { type: 'string', description: 'Exact product SKU (alternative to nombre)' },
      },
    },
  },

  async execute({ nombre, sku }, tenantId) {
    // Resolve product ID
    let productId: string | undefined

    if (sku) {
      const product = await prisma.product.findFirst({
        where:  { tenantId, sku: { equals: sku as string, mode: 'insensitive' } },
        select: { id: true },
      })
      if (!product) return { error: `No se encontró producto con SKU "${sku}".` }
      productId = product.id
    } else if (nombre) {
      const product = await prisma.product.findFirst({
        where:  { tenantId, name: { contains: nombre as string, mode: 'insensitive' } },
        select: { id: true },
      })
      if (!product) return { error: `No se encontró producto que coincida con "${nombre}".` }
      productId = product.id
    } else {
      return { error: 'Proporciona nombre o SKU del producto.' }
    }

    const stocks = await prisma.stock.findMany({
      where:   { productId, product: { tenantId } },
      include: {
        product: { select: { name: true, sku: true, unit: true, salePrice: true } },
        branch:  { select: { name: true } },
      },
    })

    if (stocks.length === 0) {
      return { stockTotal: 0, mensaje: 'No hay registros de stock para este producto.', sucursales: [] }
    }

    const totalStock = stocks.reduce((sum, s) => sum + Number(s.quantity), 0)
    const p = stocks[0]!.product

    return {
      producto:    p.name,
      sku:         p.sku,
      unidad:      p.unit,
      precioVenta: p.salePrice != null ? Number(p.salePrice) : null,
      stockTotal:  totalStock,
      sucursales:  stocks.map((s) => ({
        sucursal: s.branch.name,
        cantidad: Number(s.quantity),
      })),
    }
  },
}

// ─── notificar_vendedor ───────────────────────────────────────────────────────

const notificarVendedor: AgentTool = {
  definition: {
    name:        'notificar_vendedor',
    description: 'Sends an in-app notification to the salesperson assigned to a client or deal. Falls back to all ARI area managers if no salesperson is assigned. Use when a situation requires human attention.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string', description: 'Client ID to look up the assigned salesperson' },
        dealId:   { type: 'string', description: 'Deal ID to look up the assigned salesperson (alternative to clientId)' },
        title:    { type: 'string', description: 'Short notification title' },
        mensaje:  { type: 'string', description: 'Notification body' },
      },
      required: ['title', 'mensaje'],
    },
  },

  async execute({ clientId, dealId, title, mensaje }, tenantId) {
    let assignedTo: string | null = null
    let linkPath: string | undefined

    // Resolver el vendedor asignado
    if (dealId) {
      const deal = await prisma.deal.findFirst({
        where:  { id: dealId as string, tenantId },
        select: { assignedTo: true, clientId: true },
      })
      if (!deal) return { error: `Deal "${dealId}" no encontrado.` }
      assignedTo = deal.assignedTo ?? null
      linkPath   = `/ari/pipeline`
    } else if (clientId) {
      const client = await prisma.client.findFirst({
        where:  { id: clientId as string, tenantId },
        select: { assignedTo: true },
      })
      if (!client) return { error: `Cliente "${clientId}" no encontrado.` }
      assignedTo = client.assignedTo ?? null
      linkPath   = `/ari/clients/${clientId}`
    }

    if (assignedTo) {
      await prisma.notification.create({
        data: {
          tenantId,
          userId:  assignedTo,
          module:  'ARI',
          type:    'agente_aviso',
          title:   title as string,
          message: mensaje as string,
          link:    linkPath,
        },
      })
      return { success: true, notificados: 1, destinatario: 'vendedor_asignado' }
    }

    // Fallback — notificar a todos los AREA_MANAGER de ARI
    const managers = await prisma.user.findMany({
      where: {
        tenantId,
        OR: [
          { role: 'AREA_MANAGER', module: 'ARI' },
          { role: 'TENANT_ADMIN' },
        ],
      },
      select: { id: true },
    })

    if (managers.length === 0) {
      return { error: 'No hay vendedor asignado ni gerentes de ARI disponibles para notificar.' }
    }

    await prisma.notification.createMany({
      data: managers.map((u) => ({
        tenantId,
        userId:  u.id,
        module:  'ARI' as const,
        type:    'agente_aviso',
        title:   title as string,
        message: mensaje as string,
        ...(linkPath ? { link: linkPath } : {}),
      })),
    })

    return { success: true, notificados: managers.length, destinatario: 'gerentes_ari' }
  },
}

// ─── consultar_clientes ───────────────────────────────────────────────────────

function df(from?: unknown, to?: unknown) {
  const gte = from ? new Date(from as string) : undefined
  const lte = to   ? new Date(new Date(to as string).setHours(23, 59, 59, 999)) : undefined
  return (!gte && !lte) ? undefined : { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) }
}

const consultarClientes: AgentTool = {
  definition: {
    name: 'consultar_clientes',
    description: 'Searches for clients by name, email or phone. Returns basic info plus the count of active deals. Use when the user asks about a specific client or wants to see the client list.',
    input_schema: {
      type: 'object',
      properties: {
        nombre:   { type: 'string', description: 'Partial client name search' },
        email:    { type: 'string', description: 'Exact or partial email' },
        telefono: { type: 'string', description: 'Phone or WhatsApp number' },
        limit:    { type: 'number', description: 'Max results (default 10, max 30)' },
      },
    },
  },

  async execute({ nombre, email, telefono, limit }, tenantId) {
    const take = Math.min(30, Math.max(1, Number(limit ?? 10)))
    const OR: object[] = []

    if (nombre)   OR.push({ name:      { contains: nombre   as string, mode: 'insensitive' } })
    if (email)    OR.push({ email:     { contains: email    as string, mode: 'insensitive' } })
    if (telefono) OR.push({ phone:     { contains: telefono as string } })
    if (telefono) OR.push({ whatsappId:{ contains: telefono as string } })

    const clients = await prisma.client.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(OR.length > 0 ? { OR } : {}),
      },
      select: {
        id:           true,
        name:         true,
        email:        true,
        phone:        true,
        company:      true,
        source:       true,
        assignedUser: { select: { name: true } },
        _count:       { select: { deals: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    })

    if (clients.length === 0) return { total: 0, clientes: [], message: 'No se encontraron clientes con los filtros indicados.' }

    return {
      total: clients.length,
      clientes: clients.map((c) => ({
        id:       c.id,
        nombre:   c.name,
        empresa:  c.company   ?? null,
        email:    c.email     ?? null,
        telefono: c.phone     ?? null,
        fuente:   c.source    ?? null,
        vendedor: c.assignedUser?.name ?? null,
        deals:    c._count.deals,
      })),
    }
  },
}

// ─── consultar_deals ──────────────────────────────────────────────────────────

const consultarDeals: AgentTool = {
  definition: {
    name: 'consultar_deals',
    description: 'Returns deals with optional filters by pipeline stage, assigned salesperson and creation date range. Use to get a pipeline overview or review specific deals.',
    input_schema: {
      type: 'object',
      properties: {
        stageId:    { type: 'string', description: 'Filter by specific pipeline stage ID' },
        stageName:  { type: 'string', description: 'Filter by stage name (partial match)' },
        vendedorId: { type: 'string', description: 'Filter by assigned salesperson user ID' },
        from:       { type: 'string', description: 'Created from YYYY-MM-DD' },
        to:         { type: 'string', description: 'Created to YYYY-MM-DD' },
        limit:      { type: 'number', description: 'Max results (default 20, max 50)' },
      },
    },
  },

  async execute({ stageId, stageName, vendedorId, from, to, limit }, tenantId) {
    const take       = Math.min(50, Math.max(1, Number(limit ?? 20)))
    const dateFilter = df(from, to)

    // Resolver stageId por nombre si se pasa stageName
    let resolvedStageId = stageId as string | undefined
    if (!resolvedStageId && stageName) {
      const stage = await prisma.pipelineStage.findFirst({
        where:  { tenantId, name: { contains: stageName as string, mode: 'insensitive' } },
        select: { id: true },
      })
      if (!stage) return { error: `No se encontró etapa con nombre "${String(stageName)}".` }
      resolvedStageId = stage.id
    }

    const deals = await prisma.deal.findMany({
      where: {
        tenantId,
        ...(resolvedStageId ? { stageId: resolvedStageId }         : {}),
        ...(vendedorId      ? { assignedTo: vendedorId as string } : {}),
        ...(dateFilter      ? { createdAt: dateFilter }            : {}),
      },
      include: {
        stage:        { select: { name: true, isFinalWon: true, isFinalLost: true } },
        client:       { select: { name: true } },
        assignedUser: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    })

    if (deals.length === 0) return { total: 0, deals: [], message: 'No se encontraron deals con los filtros indicados.' }

    return {
      total: deals.length,
      deals: deals.map((d) => ({
        id:       d.id,
        titulo:   d.title,
        etapa:    d.stage.name,
        ganado:   d.stage.isFinalWon,
        perdido:  d.stage.isFinalLost,
        cliente:  d.client.name,
        vendedor: d.assignedUser?.name ?? null,
        valor:    d.value != null ? Number(d.value).toFixed(2) : null,
        cerrado:  d.closedAt ? d.closedAt.toISOString().split('T')[0] : null,
        creado:   d.createdAt.toISOString().split('T')[0],
      })),
    }
  },
}

// ─── consultar_cotizaciones ───────────────────────────────────────────────────

const consultarCotizaciones: AgentTool = {
  definition: {
    name: 'consultar_cotizaciones',
    description: 'Returns quotes (cotizaciones) with optional filters by status and client. Use to review sent quotes, check acceptance rates or find a specific quote.',
    input_schema: {
      type: 'object',
      properties: {
        estado:   { type: 'string', enum: ['draft', 'sent', 'accepted', 'rejected', 'expired'], description: 'Quote status' },
        clientId: { type: 'string', description: 'Filter by client ID' },
        from:     { type: 'string', description: 'Created from YYYY-MM-DD' },
        to:       { type: 'string', description: 'Created to YYYY-MM-DD' },
        limit:    { type: 'number', description: 'Max results (default 20, max 50)' },
      },
    },
  },

  async execute({ estado, clientId, from, to, limit }, tenantId) {
    const take       = Math.min(50, Math.max(1, Number(limit ?? 20)))
    const dateFilter = df(from, to)

    const quotes = await prisma.quote.findMany({
      where: {
        tenantId,
        ...(estado   ? { status:   estado    as string } : {}),
        ...(clientId ? { clientId: clientId  as string } : {}),
        ...(dateFilter ? { createdAt: dateFilter }        : {}),
      },
      include: {
        client:  { select: { name: true } },
        creator: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    })

    if (quotes.length === 0) return { total: 0, cotizaciones: [], message: 'No se encontraron cotizaciones con los filtros indicados.' }

    return {
      total: quotes.length,
      cotizaciones: quotes.map((q) => ({
        id:        q.id,
        numero:    q.quoteNumber,
        estado:    q.status,
        cliente:   q.client.name,
        creador:   q.creator.name,
        subtotal:  Number(q.subtotal).toFixed(2),
        total:     Number(q.total).toFixed(2),
        vence:     q.validUntil ? q.validUntil.toISOString().split('T')[0] : null,
        creado:    q.createdAt.toISOString().split('T')[0],
      })),
    }
  },
}

// ─── consultar_reporte_ventas ─────────────────────────────────────────────────

const consultarReporteVentas: AgentTool = {
  definition: {
    name: 'consultar_reporte_ventas',
    description: 'Returns sales KPIs for a period: won deals, won value, accepted quotes, conversion rate and top salesperson. Use for a sales performance overview.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date YYYY-MM-DD (default: first day of current month)' },
        to:   { type: 'string', description: 'End date YYYY-MM-DD (default: today)' },
      },
    },
  },

  async execute({ from, to }, tenantId) {
    const now  = new Date()
    const gte  = from ? new Date(from as string) : new Date(now.getFullYear(), now.getMonth(), 1)
    const lte  = to   ? new Date(new Date(to as string).setHours(23, 59, 59, 999)) : now

    const wonStages  = await prisma.pipelineStage.findMany({
      where:  { tenantId, isFinalWon: true },
      select: { id: true },
    })
    const lostStages = await prisma.pipelineStage.findMany({
      where:  { tenantId, isFinalLost: true },
      select: { id: true },
    })

    const wonIds  = wonStages.map((s) => s.id)
    const lostIds = lostStages.map((s) => s.id)
    const dateFilter = { createdAt: { gte, lte } }

    const [wonAgg, lostCount, totalCount, quoteAccepted, byVendor] = await Promise.all([
      prisma.deal.aggregate({
        where: { tenantId, stageId: { in: wonIds }, ...dateFilter },
        _sum:  { value: true },
        _count: { id: true },
      }),
      prisma.deal.count({
        where: { tenantId, stageId: { in: lostIds }, ...dateFilter },
      }),
      prisma.deal.count({
        where: { tenantId, ...dateFilter },
      }),
      prisma.quote.aggregate({
        where: { tenantId, status: 'accepted', ...dateFilter },
        _sum:  { total: true },
        _count: { id: true },
      }),
      prisma.deal.groupBy({
        by:    ['assignedTo'],
        where: { tenantId, stageId: { in: wonIds }, ...dateFilter },
        _count: { id: true },
        _sum:  { value: true },
        orderBy: { _count: { id: 'desc' } },
        take: 3,
      }),
    ])

    const dealsGanados = wonAgg._count.id
    const conversion   = totalCount > 0 ? Math.round((dealsGanados / totalCount) * 10000) / 100 : 0

    const topIds = byVendor.map((r) => r.assignedTo).filter(Boolean) as string[]
    const topUsers = topIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: topIds } }, select: { id: true, name: true } })
      : []
    const topMap  = new Map(topUsers.map((u) => [u.id, u.name]))

    return {
      periodo:         { desde: gte.toISOString().split('T')[0], hasta: lte.toISOString().split('T')[0] },
      dealsGanados,
      valorGanado:     Number(wonAgg._sum.value ?? 0).toFixed(2),
      dealsPerdidos:   lostCount,
      dealsTotal:      totalCount,
      tasaConversion:  `${conversion}%`,
      cotizacionesAceptadas: quoteAccepted._count.id,
      valorCotizaciones: Number(quoteAccepted._sum.total ?? 0).toFixed(2),
      topVendedores:   byVendor.map((r) => ({
        vendedor: r.assignedTo ? (topMap.get(r.assignedTo) ?? r.assignedTo) : 'Sin asignar',
        dealsGanados: r._count.id,
        valorTotal: Number(r._sum.value ?? 0).toFixed(2),
      })),
    }
  },
}

// ─── Catálogo ARI ─────────────────────────────────────────────────────────────

export const ARI_TOOLS: AgentTool[] = [
  buscarCliente,
  crearLead,
  consultarStockProducto,
  notificarVendedor,
  consultarClientes,
  consultarDeals,
  consultarCotizaciones,
  consultarReporteVentas,
]
