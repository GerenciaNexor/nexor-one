'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PlatformHomePage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [total,   setTotal]   = useState(0)
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
        setTotal(r.total ?? 0)
        setError(null)
      })
      .catch((e: { message?: string }) => {
        if (!alive) return
        setError(e.message ?? 'No se pudo cargar la información.')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const activos   = tenants.filter((t) => t.isActive).length
  const inactivos = tenants.filter((t) => !t.isActive).length
  const recientes = [...tenants]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Inicio</h1>
        <p className="mt-1 text-sm text-slate-400">Resumen del negocio de NEXOR</p>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300">
          {error}
        </div>
      ) : loading ? (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-5">
                <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
                <div className="mt-3 h-8 w-16 animate-pulse rounded bg-white/10" />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
            <div className="mt-4 space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-5 w-full animate-pulse rounded bg-white/10" />
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Stat cards */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total clientes" value={total} accent="text-violet-300" />
            <StatCard label="Activos"        value={activos} accent="text-emerald-300" />
            <StatCard label="Inactivos"      value={inactivos} accent="text-red-300" />
          </div>

          {/* Últimos clientes */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-100">Últimos clientes</h2>
            {recientes.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Aún no hay clientes.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {recientes.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/platform/clients/${t.id}`}
                      className="-mx-2 flex items-center justify-between rounded-lg px-2 py-3 transition-colors hover:bg-white/5"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-100">{t.name}</p>
                        <p className="truncate text-xs text-slate-500">@{t.slug}</p>
                      </div>
                      <div className="flex items-center gap-3 pl-4">
                        <span
                          className={[
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                            t.isActive
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-red-500/15 text-red-300',
                          ].join(' ')}
                        >
                          {t.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                        <span className="text-xs text-slate-500">{fmtDate(t.createdAt)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── StatCard ────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${accent}`}>{value}</p>
    </div>
  )
}
