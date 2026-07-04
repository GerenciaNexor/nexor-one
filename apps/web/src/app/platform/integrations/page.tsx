'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'

// ─── Types ───────────────────────────────────────────────────────────────────

type Tenant = {
  id:       string
  name:     string
  isActive: boolean
}

type TenantsResponse = { data: Tenant[] }

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
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Integraciones por cliente</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Conecta o desconecta WhatsApp/Gmail de cada cliente desde su ficha.
        </p>
      </header>

      {/* Clients list */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 dark:bg-white/5 dark:text-slate-400">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Empresa</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Estado</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide">Canales</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-white/5">
                      {Array.from({ length: 3 }).map((__, c) => (
                        <td key={c} className="px-5 py-3.5">
                          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
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
                    <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5">
                      <td className="px-5 py-3.5">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{t.name}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={[
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                          t.isActive
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                            : 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
                        ].join(' ')}>
                          {t.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={`/platform/clients/${t.id}`}
                          className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                        >
                          Gestionar canales
                        </Link>
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
