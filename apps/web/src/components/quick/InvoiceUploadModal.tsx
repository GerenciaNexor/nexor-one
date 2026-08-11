'use client'

import { useState, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'
import { useAuthStore } from '@/store/auth'
import { QuickRegisterModal } from '@/components/quick/QuickRegisterModal'

type Kind = 'purchase' | 'sale'
interface Opt  { id: string; name: string; isGeneric?: boolean }
interface Prod { id: string; sku: string; name: string; unit: string; salePrice: number | null; costPrice: number | null }

interface ExtractedItem {
  description: string
  quantity:    number | null
  unitValue:   number | null
  productId:   string | null
  productName: string | null
  inInventory: boolean
  suggestedSalePrice: number | null
  confidence:  string
}
interface ExtractResult {
  canRead: boolean
  message?: string
  kind?: Kind
  issuer?: string | null
  nit?: string | null
  date?: string | null
  total?: number | null
  items?: ExtractedItem[]
  additionalFields?: { label: string; value: string }[]
  fullExtraction?: unknown
}

/** Un ítem con su resolución editable por el humano (revisa/corrige antes de confirmar). */
interface ItemState {
  description: string
  quantity:    string
  unitValue:   string
  productId:   string | null
  productName: string | null
  inInventory: boolean
  confidence:  string
  addToInventory: boolean          // compra: agregar al inventario
  newSku: string; newUnit: string; newSalePrice: string
  mapQuery: string                 // buscar producto existente para mapear
}

const money = (n: number) => `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`

// ─── Compresión en el navegador (sin dependencia) ──────────────────────────────
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result).split(',')[1] ?? '')
    r.onerror = rej
    r.readAsDataURL(blob)
  })
}
async function processFile(file: File): Promise<{ blob: Blob; base64: string; mime: string }> {
  // PDF u otros: se envían tal cual (no se comprimen por canvas).
  if (!file.type.startsWith('image/')) {
    return { blob: file, base64: await blobToBase64(file), mime: file.type || 'application/pdf' }
  }
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file)
  })
  const maxDim = 1600
  const scale  = Math.min(1, maxDim / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
  URL.revokeObjectURL(img.src)
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.6))
  return { blob, base64: await blobToBase64(blob), mime: 'image/jpeg' }
}

export function InvoiceUploadModal({ kind, onClose, onSuccess }: {
  kind: Kind
  onClose: () => void
  onSuccess: () => void
}) {
  const user        = useAuthStore((s) => s.user)
  const isOperative = user?.role === 'OPERATIVE'
  const isSale      = kind === 'sale'
  const inputRef    = useRef<HTMLInputElement>(null)

  const [phase, setPhase]   = useState<'upload' | 'review' | 'manual'>('upload')
  const [loading, setLoading] = useState(false)
  const [err, setErr]       = useState<string | null>(null)
  const [unreadable, setUnreadable] = useState<string | null>(null)

  // Imagen procesada (comprimida) que se envía al OCR y se guarda.
  const [image, setImage] = useState<{ base64: string; mime: string } | null>(null)
  const [fullExtraction, setFull] = useState<unknown>(null)

  // Encabezado (editable).
  const [issuer, setIssuer] = useState('')
  const [nit, setNit]       = useState('')
  const [date, setDate]     = useState('')
  const [total, setTotal]   = useState('')

  const [cpId, setCpId]         = useState('')
  const [branchId, setBranchId] = useState(isOperative ? (user?.branchId ?? '') : '')
  const [items, setItems]       = useState<ItemState[]>([])

  const [additional, setAdditional] = useState<{ label: string; value: string }[]>([])
  const [counterparties, setCP] = useState<Opt[]>([])
  const [branches, setBranches] = useState<Opt[]>([])
  const [products, setProducts] = useState<Prod[]>([])
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    apiClient.get<{ data: Prod[] }>('/v1/quick/products').then((r) => setProducts(r.data)).catch(() => {})
    apiClient.get<{ data: Opt[] }>('/v1/quick/branches').then((r) => { setBranches(r.data); if (r.data.length === 1 && !isOperative) setBranchId(r.data[0]!.id) }).catch(() => {})
    apiClient.get<{ data: Opt[] }>(isSale ? '/v1/quick/clients' : '/v1/quick/suppliers').then((r) => { setCP(r.data); setCpId(r.data.find((o) => o.isGeneric)?.id ?? '') }).catch(() => {})
  }, [isSale, isOperative])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    setErr(null); setUnreadable(null); setLoading(true)
    try {
      const proc = await processFile(file)
      setImage({ base64: proc.base64, mime: proc.mime })

      const form = new FormData()
      form.append('file', proc.blob, file.name)
      form.append('kind', kind)
      const token  = useAuthStore.getState().token
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
      const res = await fetch(`${apiUrl}/v1/quick/invoices/extract`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; throw new Error(b.error ?? 'No se pudo leer la factura') }
      const { data } = await res.json() as { data: ExtractResult }

      if (!data.canRead) { setUnreadable(data.message ?? 'Lo siento, la imagen no se logró entender, ingresa los valores manualmente.'); return }

      setFull(data.fullExtraction ?? null)
      setAdditional((data.additionalFields ?? []).filter((f) => f?.label && f?.value))
      setIssuer(data.issuer ?? ''); setNit(data.nit ?? ''); setDate(data.date ?? ''); setTotal(data.total != null ? String(data.total) : '')
      setItems((data.items ?? []).map((it) => ({
        description: it.description, quantity: it.quantity != null ? String(it.quantity) : '1',
        unitValue: it.unitValue != null ? String(it.unitValue) : '', productId: it.productId, productName: it.productName,
        inInventory: it.inInventory, confidence: it.confidence,
        addToInventory: isSale, newSku: '', newUnit: 'unidad', newSalePrice: it.suggestedSalePrice != null ? String(it.suggestedSalePrice) : '',
        mapQuery: '',
      })))
      setPhase('review')
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo procesar la imagen. Intenta con una foto más nítida.')
    } finally { setLoading(false) }
  }

  function patch(i: number, p: Partial<ItemState>) { setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, ...p } : it)) }
  function mapToProduct(i: number, prod: Prod) {
    patch(i, { productId: prod.id, productName: prod.name, inInventory: true, mapQuery: '',
      unitValue: items[i]!.unitValue || String((isSale ? prod.salePrice : prod.costPrice) ?? '') })
  }

  const preview = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitValue) || 0), 0)

  async function confirm() {
    setErr(null)
    for (const it of items) {
      if (!(Number(it.quantity) > 0)) { setErr(`Indica la cantidad de "${it.description}".`); return }
      if (it.unitValue === '' || Number(it.unitValue) < 0) { setErr(`Indica el ${isSale ? 'precio' : 'costo'} de "${it.description}".`); return }
      if (!it.productId) {
        if (isSale) { setErr(`"${it.description}" no está en inventario: mapéalo a un producto existente antes de vender.`); return }
        if (it.addToInventory) {
          if (!it.newSku.trim()) { setErr(`Indica el SKU para agregar "${it.description}".`); return }
          if (it.newSalePrice === '' || Number(it.newSalePrice) <= 0) { setErr(`Indica el precio de venta para "${it.description}".`); return }
        }
      }
    }
    if (!isOperative && items.some((it) => it.productId || (!isSale && it.addToInventory)) && !branchId) { setErr('Selecciona la sucursal.'); return }

    const payloadItems = items.map((it) => {
      const base = { description: it.description, quantity: Number(it.quantity), unitValue: Number(it.unitValue) }
      if (it.productId) return { ...base, productId: it.productId }
      if (!isSale && it.addToInventory) return { ...base, addToInventory: true, newProduct: {
        sku: it.newSku.trim(), name: it.description, unit: it.newUnit || 'unidad',
        salePrice: Number(it.newSalePrice), costPrice: Number(it.unitValue), minStock: 0, isSellable: true, isRentable: false,
      } }
      return { ...base, addToInventory: false }
    })

    setSaving(true)
    try {
      await apiClient.post('/v1/quick/invoices', {
        kind, ...(isSale ? { clientId: cpId || null } : { supplierId: cpId || null }),
        branchId: branchId || undefined, date: date || undefined,
        issuer: issuer || null, nit: nit || null, total: total ? Number(total) : null,
        imageBase64: image?.base64, imageMime: image?.mime, fullExtraction: fullExtraction ?? {},
        items: payloadItems,
      })
      onSuccess()
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo registrar la factura.')
    } finally { setSaving(false) }
  }

  if (phase === 'manual') return <QuickRegisterModal initialMode={kind} lockMode onClose={onClose} onSuccess={onSuccess} />

  const inp = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
  const lbl = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400'

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Cargar factura por foto — {isSale ? 'Venta' : 'Compra'} rápida</h3>
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">La lectura te propone los datos; tú los revisas y corriges antes de guardar. Una imagen a la vez.</p>

          {/* ── Fase subir ── */}
          {phase === 'upload' && (
            <div className="mt-6 flex flex-col items-center gap-3 py-8">
              <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={onFile} className="hidden" />
              <button onClick={() => inputRef.current?.click()} disabled={loading}
                className="rounded-xl border-2 border-dashed border-slate-300 px-8 py-6 text-sm font-medium text-slate-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300">
                {loading ? 'Leyendo la factura…' : '📷 Selecciona una foto de la factura'}
              </button>
              <p className="text-xs text-slate-400">JPG, PNG, WEBP o PDF · se comprime automáticamente</p>
              {unreadable && (
                <div className="mt-2 w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  {unreadable}
                  <button onClick={() => setPhase('manual')} className="ml-2 font-semibold underline">Ingresar manualmente</button>
                </div>
              )}
              {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
            </div>
          )}

          {/* ── Fase revisión ── */}
          {phase === 'review' && (
            <div className="mt-4 max-h-[68vh] space-y-4 overflow-y-auto pr-1">
              {/* Encabezado + contraparte */}
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>{isSale ? 'Cliente' : 'Proveedor / Emisor'}</label>
                  <select value={cpId} onChange={(e) => setCpId(e.target.value)} className={inp}>
                    {counterparties.map((o) => <option key={o.id} value={o.id}>{o.name}{o.isGeneric ? ' (genérico)' : ''}</option>)}
                  </select></div>
                {!isOperative && (
                  <div><label className={lbl}>Sucursal</label>
                    <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inp}>
                      <option value="">Seleccionar…</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select></div>
                )}
                <div><label className={lbl}>Emisor (leído)</label><input value={issuer} onChange={(e) => setIssuer(e.target.value)} className={inp} placeholder="Nombre en la factura" /></div>
                <div><label className={lbl}>NIT</label><input value={nit} onChange={(e) => setNit(e.target.value)} className={inp} /></div>
                <div><label className={lbl}>Fecha</label><input type="date" value={date?.slice(0, 10) ?? ''} onChange={(e) => setDate(e.target.value)} className={inp} /></div>
                <div><label className={lbl}>Total (leído)</label><input type="number" value={total} onChange={(e) => setTotal(e.target.value)} className={inp} /></div>
              </div>

              {/* Ítems */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Ítems leídos ({items.length})</p>
                <div className="space-y-2">
                  {items.map((it, i) => (
                    <div key={i} className={`rounded-xl border p-3 ${it.inInventory ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-900/10' : 'border-amber-200 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-900/10'}`}>
                      <div className="grid grid-cols-12 gap-2">
                        <input value={it.description} onChange={(e) => patch(i, { description: e.target.value })} className={`${inp} col-span-6`} placeholder="Descripción" />
                        <input type="number" min="0" value={it.quantity} onChange={(e) => patch(i, { quantity: e.target.value })} className={`${inp} col-span-2`} placeholder="Cant." />
                        <input type="number" min="0" value={it.unitValue} onChange={(e) => patch(i, { unitValue: e.target.value })} className={`${inp} col-span-4`} placeholder={isSale ? 'Precio unit.' : 'Costo unit.'} />
                      </div>

                      {/* Estado de inventario */}
                      <div className="mt-2 text-xs">
                        {it.inInventory ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                            ✓ En inventario: {it.productName}
                            <button onClick={() => patch(i, { productId: null, productName: null, inInventory: false })} className="ml-1 text-emerald-600 underline">cambiar</button>
                          </span>
                        ) : (
                          <div className="space-y-2">
                            <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                              No está en inventario — {isSale ? 'debes agregarlo (mapear a un producto)' : '¿lo agregas?'}
                            </span>
                            {/* Mapear a existente (corrige el match; obligatorio en venta) */}
                            <div className="relative">
                              <input value={it.mapQuery} onChange={(e) => patch(i, { mapQuery: e.target.value })} className={inp} placeholder="Buscar producto existente para mapear…" />
                              {it.mapQuery.trim() && (
                                <div className="absolute z-20 mt-0.5 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-900">
                                  {products.filter((p) => (p.name + p.sku).toLowerCase().includes(it.mapQuery.trim().toLowerCase())).slice(0, 6).map((p) => (
                                    <button key={p.id} onClick={() => mapToProduct(i, p)} className="block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800">
                                      <span className="font-medium">{p.name}</span> <span className="text-slate-400">{p.sku}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            {/* Compra: opción de crear producto nuevo (pide precio de venta) o dejar solo en la factura */}
                            {!isSale && (
                              <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                <input type="checkbox" checked={it.addToInventory} onChange={(e) => patch(i, { addToInventory: e.target.checked })} />
                                Crear producto nuevo y afectar stock
                              </label>
                            )}
                            {!isSale && it.addToInventory && (
                              <div className="grid grid-cols-3 gap-2">
                                <input value={it.newSku} onChange={(e) => patch(i, { newSku: e.target.value })} className={inp} placeholder="SKU *" />
                                <input value={it.newUnit} onChange={(e) => patch(i, { newUnit: e.target.value })} className={inp} placeholder="Unidad" />
                                <input type="number" value={it.newSalePrice} onChange={(e) => patch(i, { newSalePrice: e.target.value })} className={inp} placeholder="Precio venta *" />
                              </div>
                            )}
                            {!isSale && !it.addToInventory && <p className="text-slate-500">Quedará solo en el registro de la factura (sin tocar stock).</p>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                <span className="text-slate-500">{isSale ? 'Ingreso' : 'Gasto'} a registrar</span>
                <span className={`font-semibold ${isSale ? 'text-emerald-600' : 'text-slate-800 dark:text-slate-100'}`}>{money(preview)}</span>
              </div>

              {/* HU-193-B — todo lo demás que trae la factura (sin campo propio): secundario pero visible.
                  Se guarda con la factura (fullExtraction) al confirmar → recuperable después. */}
              {additional.length > 0 && (
                <details className="rounded-lg border border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/40">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                    Información adicional obtenida ({additional.length}) — se guarda con la factura
                  </summary>
                  <dl className="divide-y divide-slate-100 px-3 pb-2 dark:divide-slate-700/60">
                    {additional.map((f, i) => (
                      <div key={i} className="flex gap-3 py-1.5 text-xs">
                        <dt className="w-2/5 shrink-0 font-medium text-slate-500 dark:text-slate-400">{f.label}</dt>
                        <dd className="min-w-0 flex-1 break-words text-slate-700 dark:text-slate-200">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}

              {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
            </div>
          )}

          {phase === 'review' && (
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
              <button onClick={confirm} disabled={saving} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${isSale ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {saving ? 'Registrando…' : `Confirmar y registrar ${isSale ? 'venta' : 'compra'}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </Portal>
  )
}
