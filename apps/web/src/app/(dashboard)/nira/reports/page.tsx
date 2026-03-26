'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface SupplierRow {
  id:         string
  name:       string
  total:      number
  orderCount: number
  percentage: number
}

interface CategoryRow {
  category:   string
  total:      number
  percentage: number
}

interface CostsReport {
  grandTotal:  number
  orderCount:  number
  bySupplier:  SupplierRow[]
  byCategory:  CategoryRow[]
  filter: {
    from:     string | null
    to:       string | null
    branchId: string | null
  }
}

interface Branch { id: string; name: string }

// ─── Auxiliares ───────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `$${n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [branches,   setBranches]   = useState<Branch[]>([])
  const [from,       setFrom]       = useState('')
  const [to,         setTo]         = useState('')
  const [branchId,   setBranchId]   = useState('')
  const [report,     setReport]     = useState<CostsReport | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Cargar sucursales para el filtro
  useEffect(() => {
    apiClient.get<{ data: Branch[] }>('/v1/branches')
      .then((r) => setBranches(r.data))
      .catch(() => null)
  }, [])

  // Cargar reporte al montar (sin filtros)
  useEffect(() => { fetchReport() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function fetchReport() {
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams()
    if (from)     qs.set('from',     from)
    if (to)       qs.set('to',       to)
    if (branchId) qs.set('branchId', branchId)
    const query = qs.toString()
    apiClient.get<CostsReport>(`/v1/nira/reports/costs${query ? `?${query}` : ''}`)
      .then(setReport)
      .catch((e: unknown) => {
        const err = e as { message?: string }
        setError(err.message ?? 'Error al cargar el reporte')
      })
      .finally(() => setLoading(false))
  }

  function handleFilter(e: React.FormEvent) {
    e.preventDefault()
    fetchReport()
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">

      {/* ── Encabezado ────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Reporte de costos</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Gasto en órdenes de compra aprobadas, enviadas, parciales y recibidas.
          </p>
        </div>
        <Link
          href="/nira/ranking"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
          </svg>
          Ver ranking de proveedores
        </Link>
      </div>

      {/* ── Filtros ───────────────────────────────────────────────────────── */}
      <form onSubmit={handleFilter} className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Desde</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Hasta</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        {branches.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Sucursal</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Todas</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? 'Cargando…' : 'Aplicar'}
        </button>
        {(from || to || branchId) && (
          <button
            type="button"
            onClick={() => { setFrom(''); setTo(''); setBranchId(''); setTimeout(fetchReport, 0) }}
            className="text-sm text-slate-500 hover:text-slate-700 hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </form>

      {error && (
        <div className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      {report && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total gastado</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{fmt(report.grandTotal)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Órdenes</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{report.orderCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Proveedores</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{report.bySupplier.length}</p>
            </div>
          </div>

          {report.orderCount === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center">
              <p className="text-sm text-slate-400">No hay órdenes de compra en el período seleccionado</p>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">

              {/* ── Por proveedor ──────────────────────────────────────── */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-3">
                  <h2 className="text-sm font-semibold text-slate-700">Por proveedor</h2>
                  <p className="text-xs text-slate-400">Ordenado por total comprado</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-5 py-2.5">Proveedor</th>
                        <th className="px-5 py-2.5 text-center">Órdenes</th>
                        <th className="px-5 py-2.5 text-right">Total</th>
                        <th className="px-5 py-2.5 w-32">% del gasto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {report.bySupplier.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/60">
                          <td className="px-5 py-3 font-medium text-slate-900">{s.name}</td>
                          <td className="px-5 py-3 text-center text-slate-500">{s.orderCount}</td>
                          <td className="px-5 py-3 text-right font-semibold text-slate-900">{fmt(s.total)}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <ProgressBar pct={s.percentage} color="bg-blue-500" />
                              </div>
                              <span className="shrink-0 text-xs text-slate-400">{s.percentage}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Por categoría ──────────────────────────────────────── */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-3">
                  <h2 className="text-sm font-semibold text-slate-700">Por categoría de producto</h2>
                </div>
                {report.byCategory.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-slate-400">
                    Sin datos de categoría para el período
                  </p>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {report.byCategory.map((c) => (
                      <div key={c.category} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-4">
                          <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                            {c.category}
                          </p>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold text-slate-900">{fmt(c.total)}</p>
                            <p className="text-xs text-slate-400">{c.percentage}%</p>
                          </div>
                        </div>
                        <div className="mt-2">
                          <ProgressBar pct={c.percentage} color="bg-violet-500" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Estado de carga inicial */}
      {loading && !report && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white px-5 py-4">
                <div className="mb-2 h-3 w-20 rounded bg-slate-200" />
                <div className="h-7 w-28 rounded bg-slate-100" />
              </div>
            ))}
          </div>
          <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white" />
        </div>
      )}
    </div>
  )
}
