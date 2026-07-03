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

// ─── Component ───────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

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

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Integraciones por cliente</h1>
        <p className="mt-1 text-sm text-slate-400">
          Canales de WhatsApp y Gmail conectados a cada cliente.
        </p>
      </header>

      {/* Info panel */}
      <div className="mb-6 rounded-xl border border-violet-500/30 bg-violet-500/10 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">
            i
          </span>
          <div>
            <p className="text-sm font-medium text-violet-200">Próximamente (HU-139)</p>
            <p className="mt-1 text-sm text-slate-300">
              La conexión de canales (WhatsApp / Gmail) por cliente llega con HU-139. Por ahora
              esta vista solo muestra el listado de clientes; la gestión de canales se habilitará
              en esa entrega.
            </p>
          </div>
        </div>
      </div>

      {/* Clients list */}
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
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide">Canales</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-t border-white/5">
                      {Array.from({ length: 3 }).map((__, c) => (
                        <td key={c} className="px-5 py-3.5">
                          <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : tenants.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-16 text-center text-sm text-slate-500">
                      Aún no hay clientes.
                    </td>
                  </tr>
                ) : (
                  tenants.map((t) => (
                    <tr key={t.id} className="border-t border-white/5 hover:bg-white/5">
                      <td className="px-5 py-3.5">
                        <span className="font-medium text-slate-100">{t.name}</span>
                        <span className="ml-1.5 text-xs text-slate-500">@{t.slug}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={[
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                          t.isActive
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-red-500/15 text-red-300',
                        ].join(' ')}>
                          {t.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          disabled
                          title="Disponible con HU-139"
                          className="cursor-not-allowed rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-500"
                        >
                          Gestionar canales
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
    </div>
  )
}
