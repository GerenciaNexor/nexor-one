'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'

// ─── Types ───────────────────────────────────────────────────────────────────

type Tenant = {
  id:        string
  name:      string
  slug:      string
  isActive:  boolean
  createdAt: string
}

type TenantsResponse = { data: Tenant[]; total: number }

type Filter = 'all' | 'active' | 'cancelled'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [filter,  setFilter]  = useState<Filter>('all')

  // Modal state
  const [target,   setTarget]   = useState<Tenant | null>(null)
  const [reason,   setReason]   = useState('')
  const [saving,   setSaving]   = useState(false)
  const [modalErr, setModalErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    apiClient
      .get<TenantsResponse>('/v1/admin/tenants?limit=100')
      .then((r) => {
        if (!alive) return
        setTenants(r.data ?? [])
        setError(null)
      })
      .catch((e: { message?: string }) => {
        if (!alive) return
        setError(e.message ?? 'No se pudo cargar la información.')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const visible = tenants.filter((t) =>
    filter === 'all' ? true : filter === 'active' ? t.isActive : !t.isActive,
  )

  function openModal(t: Tenant) {
    setTarget(t)
    setReason('')
    setModalErr(null)
  }

  function closeModal() {
    if (saving) return
    setTarget(null)
    setReason('')
    setModalErr(null)
  }

  async function confirmToggle() {
    if (!target) return
    const trimmed = reason.trim()
    if (!trimmed) {
      setModalErr('El motivo es obligatorio.')
      return
    }
    const newValue = !target.isActive
    setSaving(true)
    setModalErr(null)
    try {
      await apiClient.put(`/v1/admin/tenants/${target.id}/toggle`, {
        isActive: newValue,
        reason:   trimmed,
      })
      setTenants((prev) =>
        prev.map((t) => (t.id === target.id ? { ...t, isActive: newValue } : t)),
      )
      setTarget(null)
      setReason('')
    } catch (e) {
      const err = e as { message?: string }
      setModalErr(err.message ?? 'No se pudo actualizar la suscripción.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Suscripciones</h1>
        <p className="mt-1 text-sm text-slate-400">
          Estado de cada cliente. Activar o cancelar (queda auditado).
        </p>
      </header>

      {/* Filter */}
      <div className="mb-4 flex items-center gap-2">
        <label className="text-xs font-medium text-slate-400">Filtrar</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="all">Todas</option>
          <option value="active">Activas</option>
          <option value="cancelled">Canceladas</option>
        </select>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300">
          {error}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-slate-400">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Empresa</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Estado</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Monto mensual</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Creado</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide">Acción</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-t border-white/5">
                      {Array.from({ length: 5 }).map((__, c) => (
                        <td key={c} className="px-5 py-3.5">
                          <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-sm text-slate-500">
                      No hay clientes con ese filtro.
                    </td>
                  </tr>
                ) : (
                  visible.map((t) => (
                    <tr key={t.id} className="border-t border-white/5 hover:bg-white/5">
                      <td className="px-5 py-3.5">
                        <span className="font-medium text-slate-100">{t.name}</span>
                        <span className="ml-1.5 text-xs text-slate-500">@{t.slug}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={[
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                            t.isActive
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-red-500/15 text-red-300',
                          ].join(' ')}
                        >
                          {t.isActive ? 'Activa' : 'Cancelada'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-400">
                        <span className="text-slate-300">—</span>
                        <span className="ml-2 text-xs text-slate-500">definido en HU-138</span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-400">{fmtDate(t.createdAt)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => openModal(t)}
                          className={[
                            'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                            t.isActive
                              ? 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
                          ].join(' ')}
                        >
                          {t.isActive ? 'Cancelar' : 'Activar'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-100">
              {target.isActive ? 'Cancelar suscripción' : 'Activar suscripción'}
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              {target.isActive
                ? `Vas a cancelar la suscripción de `
                : `Vas a activar la suscripción de `}
              <span className="font-medium text-slate-200">{target.name}</span>.
            </p>

            <label className="mt-4 block text-xs font-medium text-slate-400">
              Motivo <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Explica por qué (queda auditado)…"
              className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>{modalErr && <span className="text-red-400">{modalErr}</span>}</span>
              <span>{reason.length}/500</span>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmToggle}
                disabled={saving}
                className={[
                  'rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50',
                  target.isActive
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-emerald-600 hover:bg-emerald-500',
                ].join(' ')}
              >
                {saving ? 'Guardando…' : target.isActive ? 'Confirmar cancelación' : 'Confirmar activación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
