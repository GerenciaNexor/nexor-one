/**
 * HU-191 — Reglas del registro de factura confirmada (RegisterInvoiceSchema): asimetría compra/venta,
 * obligatoriedad de agregar en venta, y sucursal requerida cuando algún ítem afecta stock.
 */
import { describe, it, expect } from 'vitest'
import { RegisterInvoiceSchema } from './schema'

const base = { fullExtraction: {}, branchId: 'b1' }
const okNewProduct = { sku: 'X-1', name: 'Nuevo', unit: 'unidad', salePrice: 100, isSellable: true }

describe('HU-191 — RegisterInvoiceSchema', () => {
  it('compra: ítem con productId → válido', () => {
    const r = RegisterInvoiceSchema.safeParse({ ...base, kind: 'purchase', items: [{ description: 'X', quantity: 2, unitValue: 10, productId: 'p1' }] })
    expect(r.success).toBe(true)
  })

  it('compra: ítem sin producto y sin marcar "no agregar" → inválido (hay que resolverlo)', () => {
    const r = RegisterInvoiceSchema.safeParse({ ...base, kind: 'purchase', items: [{ description: 'Café', quantity: 1, unitValue: 5 }] })
    expect(r.success).toBe(false)
  })

  it('compra: ítem sin producto con addToInventory=false → válido (queda solo en la factura)', () => {
    const r = RegisterInvoiceSchema.safeParse({ kind: 'purchase', fullExtraction: {}, items: [{ description: 'Café', quantity: 1, unitValue: 5, addToInventory: false }] })
    expect(r.success).toBe(true) // sin ítems con stock → no exige sucursal
  })

  it('compra: agregar producto nuevo (addToInventory + newProduct) → válido', () => {
    const r = RegisterInvoiceSchema.safeParse({ ...base, kind: 'purchase', items: [{ description: 'Café', quantity: 1, unitValue: 5, addToInventory: true, newProduct: okNewProduct }] })
    expect(r.success).toBe(true)
  })

  it('venta: ítem sin productId → inválido (agregar es obligatorio)', () => {
    const r = RegisterInvoiceSchema.safeParse({ ...base, kind: 'sale', items: [{ description: 'X', quantity: 1, unitValue: 10 }] })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]!.path).toContain('productId')
  })

  it('venta: ítem con productId → válido', () => {
    const r = RegisterInvoiceSchema.safeParse({ ...base, kind: 'sale', items: [{ description: 'X', quantity: 1, unitValue: 10, productId: 'p1' }] })
    expect(r.success).toBe(true)
  })

  it('sucursal obligatoria si un ítem afecta stock', () => {
    const r = RegisterInvoiceSchema.safeParse({ kind: 'purchase', fullExtraction: {}, items: [{ description: 'X', quantity: 1, unitValue: 10, productId: 'p1' }] })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.path.includes('branchId'))).toBe(true)
  })
})
