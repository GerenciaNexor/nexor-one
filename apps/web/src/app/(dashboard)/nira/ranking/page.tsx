'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface SupplierScore {
  priceScore:       number
  deliveryScore:    number
  qualityScore:     number
  overallScore:     number
  totalOrders:      number
  onTimeDeliveries: number
  calculatedAt:     string
}

interface RankedSupplier {
  id:    string
  name:  string
  city:  string | null
  score: SupplierScore | null
}

interface RankingResult {
  data:  RankedSupplier[]
  total: number
}

// ─── Auxiliares ───────────────────────────────────────────────────────────────

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${(value / 10) * 100}%` }}
        />
      </div>
      <span className="w-6 text-right text-xs tabular-nums text-slate-600">
        {value.toFixed(1)}
      </span>
    </div>
  )
}

function OverallBadge({ score }: { score: number }) {
  const color =
    score >= 7 ? 'bg-emerald-100 text-emerald-700' :
    score >= 5 ? 'bg-amber-100 text-amber-700' :
    'bg-red-100 text-red-600'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {score.toFixed(1)}
    </span>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function RankingPage() {
  const [result,  setResult]  = useState<RankingResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    apiClient.get<RankingResult>('/v1/nira/reports/suppliers-ranking')
      .then((r) => setResult(r))
      .catch((e: unknown) => {
        const err = e as { message?: string }
        setError(err.message ?? 'Error al cargar el ranking')
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6">

      {/* ── Encabezado ────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Ranking de proveedores</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Proveedores ordenados por score general. Calculado diariamente a partir de precio, entrega a tiempo y calidad.
        </p>
      </div>

      {/* ── Carga / error ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          Cargando ranking…
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ── Leyenda de dimensiones ─────────────────────────────────────────── */}
      {result && !loading && (
        <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> Precio
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-violet-500" /> Entrega
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Calidad
          </span>
        </div>
      )}

      {/* ── Tabla desktop ─────────────────────────────────────────────────── */}
      {result && !loading && (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-10 px-4 py-3 text-center">#</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3 text-center">Score</th>
                  <th className="px-4 py-3">Precio</th>
                  <th className="px-4 py-3">Entrega</th>
                  <th className="px-4 py-3">Calidad</th>
                  <th className="px-4 py-3 text-center">OC recibidas</th>
                  <th className="px-4 py-3 text-center">Actualizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.data.map((s, idx) => (
                  <tr key={s.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3 text-center">
                      <span className={[
                        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                        idx === 0 ? 'bg-amber-100 text-amber-700' :
                        idx === 1 ? 'bg-slate-200 text-slate-600' :
                        idx === 2 ? 'bg-orange-100 text-orange-600' :
                        'bg-slate-100 text-slate-500',
                      ].join(' ')}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{s.name}</p>
                      {s.city && <p className="text-xs text-slate-400">{s.city}</p>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.score ? <OverallBadge score={s.score.overallScore} /> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {s.score ? <ScoreBar value={s.score.priceScore} color="bg-blue-500" /> : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {s.score ? <ScoreBar value={s.score.deliveryScore} color="bg-violet-500" /> : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {s.score ? <ScoreBar value={s.score.qualityScore} color="bg-emerald-500" /> : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500">
                      {s.score ? s.score.totalOrders : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-400">
                      {s.score
                        ? new Date(s.score.calculatedAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                  </tr>
                ))}
                {result.data.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">
                      No hay proveedores activos con score calculado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Tarjetas mobile ─────────────────────────────────────────────── */}
          <div className="space-y-3 sm:hidden">
            {result.data.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
                <p className="text-sm text-slate-400">No hay proveedores con score calculado</p>
              </div>
            )}
            {result.data.map((s, idx) => (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={[
                      'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      idx === 0 ? 'bg-amber-100 text-amber-700' :
                      idx === 1 ? 'bg-slate-200 text-slate-600' :
                      idx === 2 ? 'bg-orange-100 text-orange-600' :
                      'bg-slate-100 text-slate-500',
                    ].join(' ')}>
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-medium text-slate-900">{s.name}</p>
                      {s.city && <p className="text-xs text-slate-400">{s.city}</p>}
                    </div>
                  </div>
                  {s.score ? <OverallBadge score={s.score.overallScore} /> : <span className="text-slate-300 text-sm">—</span>}
                </div>

                {s.score && (
                  <div className="mt-3 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3">
                    <div>
                      <p className="mb-1 text-xs text-slate-400">Precio</p>
                      <ScoreBar value={s.score.priceScore} color="bg-blue-500" />
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-slate-400">Entrega</p>
                      <ScoreBar value={s.score.deliveryScore} color="bg-violet-500" />
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-slate-400">Calidad</p>
                      <ScoreBar value={s.score.qualityScore} color="bg-emerald-500" />
                    </div>
                  </div>
                )}

                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>{s.score ? `${s.score.totalOrders} OC recibidas` : 'Sin datos'}</span>
                  {s.score && (
                    <span>
                      {new Date(s.score.calculatedAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
