'use client'

import { useState, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Movement {
  id:             string
  type:           'entrada' | 'salida' | 'ajuste'
  quantity:       number
  quantityBefore: number
  quantityAfter:  number
  lotNumber:      string | null
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

function TypeBadge({ type }: { type: Movement['type'] }) {
  const styles = {
    entrada: 'bg-emerald-100 text-emerald-700',
    salida:  'bg-red-100 text-red-700',
    ajuste:  'bg-blue-100 text-blue-700',
  }
  const labels = { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste' }
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${styles[type]}`}>
      {labels[type]}
    </span>
  )
}

function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
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

// ─── Página ───────────────────────────────────────────────────────────────────

export default function MovementsPage() {
  const user        = useAuthStore((s) => s.user)
  const isOperative = user?.role === 'OPERATIVE'

  const [movements, setMovements]   = useState<Movement[]>([])
  const [meta, setMeta]             = useState({ total: 0, page: 1, totalPages: 1 })
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Filtros
  const [search, setSearch]           = useState('')
  const [liveSearch, setLiveSearch]   = useState('')
  const [typeFilter, setType]         = useState('')
  const [from, setFrom]               = useState('')
  const [to, setTo]                   = useState('')
  const [page, setPage]               = useState(1)
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
        // Filtro local por búsqueda de texto (el endpoint no tiene param search)
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

  function fmt(iso: string) {
    return new Date(iso).toLocaleString('es-CO', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-6">

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
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
          className="w-52 rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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

      {/* ── Tabla ───────────────────────────────────────────────────────── */}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Spinner /></div>
        ) : fetchError ? (
          <div className="py-16 text-center">
            <p className="text-sm text-red-500">{fetchError}</p>
            <button onClick={load} className="mt-3 text-sm text-blue-600 hover:underline">Reintentar</button>
          </div>
        ) : movements.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No se encontraron movimientos</p>
        ) : (
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
                {movements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
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
                      {m.type === 'salida' ? '-' : m.type === 'ajuste' && m.quantityAfter < m.quantityBefore ? '-' : '+'}
                      {m.quantity} {m.product.unit}
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
                ))}
              </tbody>
            </table>
          </div>
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
    </div>
  )
}
