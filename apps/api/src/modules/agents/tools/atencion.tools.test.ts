/**
 * HU-180 — Frontera de información en la CAPA DE DATOS (defensa en profundidad).
 *
 * Estas pruebas verifican que las tools del agente de atención nunca devuelven datos internos,
 * aunque el prompt fuese manipulado. El producto de prueba incluye a propósito campos internos
 * (costPrice, minStock, abcClass…) para comprobar que la tool construye una salida con whitelist
 * y NO hace passthrough.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    product:       { findFirst: vi.fn() },
    client:        { findFirst: vi.fn(), create: vi.fn() },
    pipelineStage: { findFirst: vi.fn() },
    deal:          { create: vi.fn() },
    user:          { findMany: vi.fn() },
    notification:  { createMany: vi.fn() },
  },
}))

import { prisma } from '../../../lib/prisma'
import { ATENCION_TOOLS } from './atencion.tools'

const disponibilidad = ATENCION_TOOLS.find((t) => t.definition.name === 'consultar_disponibilidad')!
const registrar      = ATENCION_TOOLS.find((t) => t.definition.name === 'registrar_interes')!

/* eslint-disable @typescript-eslint/no-explicit-any */
const mock = prisma as any

// Producto "adversarial": el mock DEVUELVE campos internos a propósito. La tool NO debe propagarlos.
function fakeProduct(disponible: number) {
  return {
    name: 'Audífonos X', description: 'Inalámbricos, 20h batería', category: 'Audio', unit: 'unidad',
    salePrice: 150000, rentalPrice: null, isSellable: true, isRentable: false,
    costPrice: 80000, minStock: 5, abcClass: 'A', preferredSupplierId: 'sup1', // internos
    stocks: [{ quantity: disponible + 5, rentedQuantity: 5 }],                  // disponible neto
  }
}

const INTERNOS = ['costPrice', 'costo', 'precioCompra', 'margen', 'minStock', 'abcClass',
  'preferredSupplierId', 'stockTotal', 'sucursales', 'quantity', 'rentedQuantity']

describe('HU-180 — consultar_disponibilidad respeta la frontera', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devuelve precio público y disponibilidad, SIN filtrar datos internos', async () => {
    mock.product.findFirst.mockResolvedValue(fakeProduct(15))
    const out = await disponibilidad.execute({ producto: 'Audífonos' }, 't1') as Record<string, unknown>
    expect(out.disponible).toBe(true)
    expect(out.precioVenta).toBe(150000)
    expect(out.caracteristicas).toBeTruthy()
    for (const k of INTERNOS) expect(out).not.toHaveProperty(k)
  })

  it('sin cantidad NO revela ningún número de inventario', async () => {
    mock.product.findFirst.mockResolvedValue(fakeProduct(15))
    const out = await disponibilidad.execute({ producto: 'Audífonos' }, 't1') as Record<string, unknown>
    expect(out).not.toHaveProperty('puedoOfrecer')
    // El único número expuesto es el precio público; nada delata el inventario (15).
    const numeric = Object.entries(out).filter(([, v]) => typeof v === 'number').map(([k]) => k)
    expect(numeric).toEqual(['precioVenta'])
  })

  it('con cantidad MAYOR a lo disponible, revela solo el tope real (cap)', async () => {
    mock.product.findFirst.mockResolvedValue(fakeProduct(15))
    const out = await disponibilidad.execute({ producto: 'Audífonos', cantidad: 100 }, 't1') as Record<string, unknown>
    expect(out.puedoOfrecer).toBe(15)
    expect(out.cubreLoSolicitado).toBe(false)
  })

  it('con cantidad MENOR/igual a lo disponible, NO revela el total (solo lo pedido)', async () => {
    mock.product.findFirst.mockResolvedValue(fakeProduct(15))
    const out = await disponibilidad.execute({ producto: 'Audífonos', cantidad: 10 }, 't1') as Record<string, unknown>
    expect(out.puedoOfrecer).toBe(10)   // no 15
    expect(out.cubreLoSolicitado).toBe(true)
  })

  it('producto inexistente → no disponible', async () => {
    mock.product.findFirst.mockResolvedValue(null)
    const out = await disponibilidad.execute({ producto: 'zzz' }, 't1') as Record<string, unknown>
    expect(out.disponible).toBe(false)
  })
})

describe('HU-180 — registrar_interes deriva a un humano con salida neutra', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devuelve solo confirmación (sin ids internos) y notifica al equipo', async () => {
    mock.client.findFirst.mockResolvedValue(null)
    mock.client.create.mockResolvedValue({ id: 'c1' })
    mock.pipelineStage.findFirst.mockResolvedValue({ id: 's1' })
    mock.deal.create.mockResolvedValue({ id: 'd1' })
    mock.user.findMany.mockResolvedValue([{ id: 'u1' }])
    mock.notification.createMany.mockResolvedValue({ count: 1 })

    const out = await registrar.execute(
      { nombre: 'Ana', contacto: '573001112233', interes: '2 audífonos', mensaje: 'quiero comprar' }, 't1',
    ) as Record<string, unknown>

    expect(out.registrado).toBe(true)
    expect(out.mensaje).toMatch(/asesor/i)
    for (const k of ['clienteId', 'dealId', 'id', 'vendedor', 'userId']) expect(out).not.toHaveProperty(k)
    expect(mock.notification.createMany).toHaveBeenCalled()
  })
})
