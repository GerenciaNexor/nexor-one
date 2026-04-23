'use client'

import { useState, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { SkeletonRows } from '@/components/ui/SkeletonRows'
import { Portal } from '@/components/ui/Portal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Movement {
  id:             string
  type:           'entrada' | 'salida' | 'ajuste'
  quantity:       number
  quantityBefore: number
  quantityAfter:  number
  lotNumber:      string | null
  expiryDate:     string | null
  notes:          string | null
  createdAt:      string
  product:        { sku: string; name: string; unit: string }
  branch:         { name: string }
  user:           { name: string; email: string } | null
}

interface MovementsResponse {
  data:       Movement[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

// ─── Auxiliares ───────────────────────────────────────────────────────────────

const TYPE_STYLES = {
  entrada: 'bg-emerald-100 text-emerald-700',
  salida:  'bg-red-100 text-red-700',
  ajuste:  'bg-blue-100 text-blue-700',
}
const TYPE_LABELS = { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste' }

function TypeBadge({ type }: { type: Movement['type'] }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${TYPE_STYLES[type]}`}>
      {TYPE_LABELS[type]}
    </span>
  )
}

function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'left'
        ? <polyline points="15 18 9 12 15 6" />
        : <polyline points="9 18 15 12 9 6" />}
    </svg>
  )
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Modal de detalle ─────────────────────────────────────────────────────────

function MovementDetailModal({ m, onClose }: { m: Movement; onClose: () => void }) {
  const sign = m.type === 'salida' || (m.type === 'ajuste' && m.quantityAfter < m.quantityBefore) ? '-' : '+'

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-2.5">
              <TypeBadge type={m.type} />
              <span className="text-sm font-semibold text-slate-900">{m.product.name}</span>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              aria-label="Cerrar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">

            {/* Producto */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Producto</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{m.product.name}</p>
                <p className="font-mono text-xs text-slate-400">{m.product.sku}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Sucursal</p>
                <p className="mt-1 text-sm text-slate-700">{m.branch.name}</p>
              </div>
            </div>

            {/* Cantidades */}
            <div className="rounded-xl bg-slate-50 px-4 py-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Antes</p>
                <p className="mt-1 text-lg font-semibold text-slate-500">{m.quantityBefore}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Movimiento</p>
                <p className={`mt-1 text-lg font-semibold ${m.type === 'entrada' ? 'text-emerald-600' : m.type === 'salida' ? 'text-red-600' : 'text-blue-600'}`}>
                  {sign}{m.quantity} {m.product.unit}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Después</p>
                <p className="mt-1 text-lg font-semibold text-slate-800">{m.quantityAfter}</p>
              </div>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Fecha</p>
                <p className="mt-1 text-sm text-slate-700">{fmt(m.createdAt)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Usuario</p>
                <p className="mt-1 text-sm text-slate-700">{m.user?.name ?? '—'}</p>
                {m.user?.email && <p className="text-xs text-slate-400">{m.user.email}</p>}
              </div>
            </div>

            {/* Lote / caducidad */}
            {(m.lotNumber || m.expiryDate) && (
              <div className="grid grid-cols-2 gap-4">
                {m.lotNumber && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Nro. de lote</p>
                    <p className="mt-1 font-mono text-sm text-slate-700">{m.lotNumber}</p>
                  </div>
                )}
                {m.expiryDate && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Fecha de caducidad</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {new Date(m.expiryDate).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Notas */}
            {m.notes && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Notas</p>
                <p className="mt-1 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{m.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function MovementsPage() {
  const user        = useAuthStore((s) => s.user)
  const isOperative = user?.role === 'OPERATIVE'

  const [movements, setMovements]       = useState<Movement[]>([])
  const [meta, setMeta]                 = useState({ total: 0, page: 1, totalPages: 1 })
  const [loading, setLoading]           = useState(true)
  const [fetchError, setFetchError]     = useState<string | null>(null)
  const [selected, setSelected]         = useState<Movement | null>(null)

  // Filtros
  const [search, setSearch]         = useState('')
  const [liveSearch, setLiveSearch] = useState('')
  const [typeFilter, setType]       = useState('')
  const [from, setFrom]             = useState('')
  const [to, setTo]                 = useState('')
  const [page, setPage]             = useState(1)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  function handleSearchInput(val: string) {
    setLiveSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setSearch(val); setPage(1) }, 300)
  }

  function load() {
    setLoading(true)
    setFetchError(null)
    const qs = new URLSearchParams()
    if (typeFilter) qs.set('type',  typeFilter)
    if (from)       qs.set('from',  from)
    if (to)         qs.set('to',    to)
    qs.set('page',  String(page))
    qs.set('limit', '50')

    apiClient.get<MovementsResponse>(`/v1/kira/stock/movements?${qs}`)
      .then((r) => {
        const q = search.toLowerCase()
        const data = q
          ? r.data.filter(
              (m) =>
                m.product.name.toLowerCase().includes(q) ||
                m.product.sku.toLowerCase().includes(q),
            )
          : r.data
        setMovements(data)
        setMeta({ total: r.total, page: r.page, totalPages: r.totalPages })
      })
      .catch((err: unknown) => {
        const e = err as { message?: string }
        setFetchError(e.message ?? 'Error al cargar movimientos')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [typeFilter, from, to, page, search])

  const cols = isOperative ? 8 : 9

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-6">

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Historial de movimientos</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {loading ? 'Cargando…' : `${meta.total} movimientos en total`}
          </p>
        </div>
        <p className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-500">
          Solo lectura — los movimientos no se pueden editar
        </p>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar producto o SKU…"
          value={liveSearch}
          onChange={(e) => handleSearchInput(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-52"
        />
        <select
          value={typeFilter}
          onChange={(e) => { setType(e.target.value); setPage(1) }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">Todos los tipos</option>
          <option value="entrada">Entrada</option>
          <option value="salida">Salida</option>
          <option value="ajuste">Ajuste</option>
        </select>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1) }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <span className="text-xs text-slate-400">al</span>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1) }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {/* ── Tabla (desktop) ─────────────────────────────────────────────── */}
      <div className="mt-4 hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Producto</th>
                {!isOperative && <th className="px-4 py-3">Sucursal</th>}
                <th className="px-4 py-3 text-center">Tipo</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-right">Antes</th>
                <th className="px-4 py-3 text-right">Después</th>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <SkeletonRows rows={8} cols={cols} />
              ) : fetchError ? (
                <tr><td colSpan={cols} className="py-16 text-center">
                  <p className="text-sm text-red-500">{fetchError}</p>
                  <button onClick={load} className="mt-3 text-sm text-blue-600 hover:underline">Reintentar</button>
                </td></tr>
              ) : movements.length === 0 ? (
                <tr><td colSpan={cols} className="py-16 text-center text-sm text-slate-400">No se encontraron movimientos</td></tr>
              ) : (
                movements.map((m) => {
                  const sign = m.type === 'salida' || (m.type === 'ajuste' && m.quantityAfter < m.quantityBefore) ? '-' : '+'
                  return (
                    <tr
                      key={m.id}
                      onClick={() => setSelected(m)}
                      className="cursor-pointer transition-colors hover:bg-blue-50/50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                        {fmt(m.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{m.product.name}</p>
                        <p className="font-mono text-xs text-slate-400">{m.product.sku}</p>
                      </td>
                      {!isOperative && (
                        <td className="px-4 py-3 text-slate-500">{m.branch.name}</td>
                      )}
                      <td className="px-4 py-3 text-center">
                        <TypeBadge type={m.type} />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">
                        {sign}{m.quantity} {m.product.unit}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">{m.quantityBefore}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{m.quantityAfter}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {m.user?.name ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="max-w-[12rem] px-4 py-3 text-xs text-slate-500">
                        <span className="line-clamp-2">{m.notes ?? <span className="text-slate-300">—</span>}</span>
                        {m.lotNumber && (
                          <span className="mt-0.5 block font-mono text-slate-400">Lote: {m.lotNumber}</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Tarjetas (móvil) ─────────────────────────────────────────────── */}
      <div className="mt-4 space-y-3 sm:hidden">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))
        ) : fetchError ? (
          <div className="rounded-xl border border-red-100 bg-white p-4 text-center">
            <p className="text-sm text-red-500">{fetchError}</p>
            <button onClick={load} className="mt-2 text-sm text-blue-600 hover:underline">Reintentar</button>
          </div>
        ) : movements.length === 0 ? (
          <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-400">
            No se encontraron movimientos
          </div>
        ) : (
          movements.map((m) => {
            const sign = m.type === 'salida' || (m.type === 'ajuste' && m.quantityAfter < m.quantityBefore) ? '-' : '+'
            return (
              <div
                key={m.id}
                onClick={() => setSelected(m)}
                className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 transition-colors active:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{m.product.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">
                      {m.product.sku}{!isOperative ? ` · ${m.branch.name}` : ''}
                    </p>
                  </div>
                  <TypeBadge type={m.type} />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-sm">
                    <span className="font-semibold text-slate-800">{sign}{m.quantity} {m.product.unit}</span>
                    <span className="ml-2 text-xs text-slate-400">{m.quantityBefore} → {m.quantityAfter}</span>
                  </div>
                  <span className="text-xs text-slate-400">{fmt(m.createdAt)}</span>
                </div>
                {(m.notes || m.lotNumber) && (
                  <p className="mt-1.5 line-clamp-1 text-xs text-slate-400">
                    {m.notes ?? (m.lotNumber ? `Lote: ${m.lotNumber}` : '')}
                  </p>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* ── Paginación ──────────────────────────────────────────────────── */}
      {meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Página {meta.page} de {meta.totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronIcon dir="left" /> Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page >= meta.totalPages}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Siguiente <ChevronIcon dir="right" />
            </button>
          </div>
        </div>
      )}

      {/* ── Modal de detalle ────────────────────────────────────────────── */}
      {selected && (
        <MovementDetailModal m={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
