import { describe, test, expect, vi, beforeEach } from 'vitest'

const { mockCreate, mockProductFindMany, mockSupplierFindMany } = vi.hoisted(() => ({
  mockCreate:           vi.fn(),
  mockProductFindMany:  vi.fn(),
  mockSupplierFindMany: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: { create: mockCreate },
  })),
}))

vi.mock('../../lib/prisma', () => ({
  directPrisma: {
    product:  { findMany: mockProductFindMany },
    supplier: { findMany: mockSupplierFindMany },
  },
}))

import { enrichExtraction, extractDocument } from './service'
import type { OrderExtraction } from './service'

// ─── Helpers de respuesta ─────────────────────────────────────────────────────

const ocrRes = (data: object) => ({
  content: [{ type: 'text', text: JSON.stringify(data) }],
  usage:   { input_tokens: 100, output_tokens: 200 },
})

const matchRes = (data: object[]) => ({
  content: [{ type: 'text', text: JSON.stringify(data) }],
  usage:   { input_tokens: 50, output_tokens: 100 },
})

// ─── Factories de datos OCR ───────────────────────────────────────────────────

const quoteData = (items: object[]) => ({
  documentType:      'quote',
  canRead:           true,
  readabilityIssues: null,
  confidence:        'high',
  client:            { value: 'Cliente Test', confidence: 'high' },
  date:              { value: '2025-01-15', confidence: 'high' },
  items,
  total: null,
  notes: null,
})

const orderData = (items: object[], supplierName = 'Proveedor ABC') => ({
  documentType:      'order',
  canRead:           true,
  readabilityIssues: null,
  confidence:        'high',
  supplier:          { value: supplierName, confidence: 'high' },
  supplierNit:       null,
  date:              { value: '2025-01-15', confidence: 'high' },
  items,
  total:        null,
  paymentTerms: null,
  notes:        null,
})

const BASE_PARAMS = {
  fileBuffer: Buffer.from('fake-image-data'),
  mimeType:   'image/jpeg',
  fileName:   'doc.jpg',
  tenantId:   'tenant-test',
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockProductFindMany.mockResolvedValue([])
  mockSupplierFindMany.mockResolvedValue([])
})

// ─── OCR — Cotización ARI ─────────────────────────────────────────────────────

describe('OCR — Cotización ARI', () => {

  test('productos con match en catálogo traen precio de venta de KIRA', async () => {
    mockCreate
      .mockResolvedValueOnce(ocrRes(quoteData([
        { description: { value: 'Papel Bond A4', confidence: 'high' }, quantity: { value: 2, confidence: 'high' }, unitPrice: null, discount: null },
      ])))
      .mockResolvedValueOnce(matchRes([{ index: 0, isProduct: true, productId: 'prod-1' }]))

    mockProductFindMany.mockResolvedValue([
      { id: 'prod-1', name: 'Papel Bond A4', sku: 'PAP-001', salePrice: 12500, costPrice: 9000 },
    ])

    const extracted = await extractDocument({ ...BASE_PARAMS, docType: 'quote' })
    const enriched  = await enrichExtraction({ extraction: extracted, tenantId: 'tenant-test' })

    expect(enriched.items[0]?.productId).toBe('prod-1')
    expect(enriched.items[0]?.unitPrice?.value).toBe(12500)
    expect(enriched.items[0]?.unitPrice?.confidence).toBe('high')
  })

  test('productos sin match en catálogo van a unrecognizedItems', async () => {
    mockCreate
      .mockResolvedValueOnce(ocrRes(quoteData([
        { description: { value: 'Papel Bond A4', confidence: 'high' }, quantity: { value: 1, confidence: 'high' }, unitPrice: { value: 5000, confidence: 'high' }, discount: null },
        { description: { value: 'Baila baila',   confidence: 'medium' }, quantity: { value: 1, confidence: 'medium' }, unitPrice: null, discount: null },
      ])))
      .mockResolvedValueOnce(matchRes([
        { index: 0, isProduct: true,  productId: 'prod-1' },
        { index: 1, isProduct: false, productId: null },
      ]))

    mockProductFindMany.mockResolvedValue([
      { id: 'prod-1', name: 'Papel Bond A4', sku: 'PAP-001', salePrice: 5000, costPrice: 3000 },
    ])

    const extracted = await extractDocument({ ...BASE_PARAMS, docType: 'quote' })
    const enriched  = await enrichExtraction({ extraction: extracted, tenantId: 'tenant-test' })

    expect(enriched.items).toHaveLength(1)
    expect(enriched.unrecognizedItems).toEqual(['Baila baila'])
  })

  test('match parcial por nombre similar trae precio del catálogo', async () => {
    mockCreate
      .mockResolvedValueOnce(ocrRes(quoteData([
        { description: { value: 'Papel c/m bond A4 75gr', confidence: 'medium' }, quantity: { value: 3, confidence: 'high' }, unitPrice: { value: 4500, confidence: 'medium' }, discount: null },
      ])))
      .mockResolvedValueOnce(matchRes([{ index: 0, isProduct: true, productId: 'prod-2' }]))

    mockProductFindMany.mockResolvedValue([
      { id: 'prod-2', name: 'Papel Bond Carta A4 75g', sku: 'PAP-002', salePrice: 4800, costPrice: 3500 },
    ])

    const extracted = await extractDocument({ ...BASE_PARAMS, docType: 'quote' })
    const enriched  = await enrichExtraction({ extraction: extracted, tenantId: 'tenant-test' })

    expect(enriched.items[0]?.productId).toBe('prod-2')
    expect(enriched.items[0]?.unitPrice?.value).toBe(4800)
  })

  test('producto en catálogo sin precio configurado conserva el precio del documento', async () => {
    mockCreate
      .mockResolvedValueOnce(ocrRes(quoteData([
        { description: { value: 'Producto sin precio', confidence: 'high' }, quantity: { value: 1, confidence: 'high' }, unitPrice: { value: 3000, confidence: 'medium' }, discount: null },
      ])))
      .mockResolvedValueOnce(matchRes([{ index: 0, isProduct: true, productId: 'prod-3' }]))

    mockProductFindMany.mockResolvedValue([
      { id: 'prod-3', name: 'Producto sin precio', sku: 'PROD-003', salePrice: null, costPrice: null },
    ])

    const extracted = await extractDocument({ ...BASE_PARAMS, docType: 'quote' })
    const enriched  = await enrichExtraction({ extraction: extracted, tenantId: 'tenant-test' })

    expect(enriched.items[0]?.productId).toBe('prod-3')
    // Sin salePrice en catálogo → se conserva el precio extraído del documento
    expect(enriched.items[0]?.unitPrice?.value).toBe(3000)
  })

  test('si Claude falla en el enriquecimiento devuelve el resultado OCR sin crashear', async () => {
    mockCreate
      .mockResolvedValueOnce(ocrRes(quoteData([
        { description: { value: 'Producto X', confidence: 'high' }, quantity: { value: 2, confidence: 'high' }, unitPrice: { value: 8000, confidence: 'high' }, discount: null },
      ])))
      .mockRejectedValueOnce(new Error('Claude timeout'))

    mockProductFindMany.mockResolvedValue([
      { id: 'prod-4', name: 'Producto X', sku: 'PROD-004', salePrice: 9000, costPrice: 5000 },
    ])

    const extracted = await extractDocument({ ...BASE_PARAMS, docType: 'quote' })
    const enriched  = await enrichExtraction({ extraction: extracted, tenantId: 'tenant-test' })

    // No debe lanzar excepción — devuelve ítems con precio original del documento
    expect(enriched.items).toHaveLength(1)
    expect(enriched.items[0]?.unitPrice?.value).toBe(8000)
  })

})

// ─── OCR — Orden de compra NIRA ───────────────────────────────────────────────

describe('OCR — Orden de compra NIRA', () => {

  test('los precios del documento del proveedor se conservan (no se sobreescriben con el catálogo)', async () => {
    mockCreate
      .mockResolvedValueOnce(ocrRes(orderData([
        { description: { value: 'Toner HP 85A', confidence: 'high' }, quantity: { value: 5, confidence: 'high' }, unitPrice: { value: 45000, confidence: 'high' }, discount: null },
      ])))
      .mockResolvedValueOnce(matchRes([{ index: 0, isProduct: true, productId: 'prod-5' }]))

    mockProductFindMany.mockResolvedValue([
      { id: 'prod-5', name: 'Toner HP 85A', sku: 'TON-001', salePrice: 60000, costPrice: 40000 },
    ])
    mockSupplierFindMany.mockResolvedValue([])

    const extracted = await extractDocument({ ...BASE_PARAMS, docType: 'order' })
    const enriched  = await enrichExtraction({ extraction: extracted, tenantId: 'tenant-test' })

    expect(enriched.items[0]?.productId).toBe('prod-5')
    // Para órdenes: se respeta el precio del proveedor (45000), no el salePrice del catálogo (60000)
    expect(enriched.items[0]?.unitPrice?.value).toBe(45000)
  })

  test('proveedor reconocido por nombre se pre-selecciona con su ID', async () => {
    mockCreate
      .mockResolvedValueOnce(ocrRes(orderData([
        { description: { value: 'Papel A4', confidence: 'high' }, quantity: { value: 10, confidence: 'high' }, unitPrice: { value: 28000, confidence: 'high' }, discount: null },
      ], 'Distribuciones ABC')))
      .mockResolvedValueOnce(matchRes([{ index: 0, isProduct: true, productId: 'prod-6' }]))

    mockProductFindMany.mockResolvedValue([
      { id: 'prod-6', name: 'Papel A4', sku: 'PAP-003', salePrice: 30000, costPrice: 25000 },
    ])
    mockSupplierFindMany.mockResolvedValue([
      { id: 'sup-1', name: 'Distribuciones ABC S.A.S.' },
    ])

    const extracted = await extractDocument({ ...BASE_PARAMS, docType: 'order' })
    const enriched  = await enrichExtraction({ extraction: extracted, tenantId: 'tenant-test' })

    expect((enriched as OrderExtraction).supplierId).toBe('sup-1')
  })

  test('proveedor no encontrado en catálogo deja supplierId null sin crashear', async () => {
    mockCreate
      .mockResolvedValueOnce(ocrRes(orderData([
        { description: { value: 'Resma papel', confidence: 'high' }, quantity: { value: 2, confidence: 'high' }, unitPrice: { value: 15000, confidence: 'high' }, discount: null },
      ], 'Proveedor Desconocido XYZ')))
      .mockResolvedValueOnce(matchRes([{ index: 0, isProduct: true, productId: null }]))

    mockProductFindMany.mockResolvedValue([
      { id: 'prod-7', name: 'Resma papel', sku: 'PAP-004', salePrice: 16000, costPrice: 12000 },
    ])
    mockSupplierFindMany.mockResolvedValue([
      { id: 'sup-2', name: 'Otra Empresa Diferente S.A.' },
    ])

    const extracted = await extractDocument({ ...BASE_PARAMS, docType: 'order' })
    const enriched  = await enrichExtraction({ extraction: extracted, tenantId: 'tenant-test' })

    expect((enriched as OrderExtraction).supplierId).toBeNull()
  })

})
