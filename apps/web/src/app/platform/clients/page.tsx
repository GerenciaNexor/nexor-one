'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'

interface TenantRow { id: string; name: string; slug: string; isActive: boolean; createdAt: string }

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function PlatformClientsPage() {
  const router = useRouter()
  const [rows, setRows]       = useState<TenantRow[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    apiClient.get<{ data: TenantRow[]; total: number }>('/v1/admin/tenants?limit=100')
      .then((r) => { setRows(r.data); setTotal(r.total) })
      .catch((e: unknown) => setError((e as { message?: string }).message ?? 'Error al cargar clientes'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = rows.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.includes(search.toLowerCase()))

  return (
    <div className="p-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-100">Clientes</h1>
        <span className="text-sm text-slate-500">{loading ? 'Cargando…' : `${total} ${total === 1 ? 'empresa' : 'empresas'}`}</span>
      </div>
      <p className="mb-4 text-sm text-slate-400">Todas las empresas de la plataforma. Abre una para ver su detalle, gestionar su suscripción o darle soporte.</p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nombre o slug…"
        className="mb-4 w-72 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-violet-500/60"
      />

      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3">Creado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="py-14 text-center text-sm text-slate-500">Cargando…</td></tr>
              ) : error ? (
                <tr><td colSpan={4} className="py-14 text-center text-sm text-red-400">{error}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="py-14 text-center text-sm text-slate-500">Sin clientes</td></tr>
              ) : (
                filtered.map((t) => (
                  <tr key={t.id} onClick={() => router.push(`/platform/clients/${t.id}`)}
                    className="cursor-pointer border-t border-white/5 transition-colors hover:bg-white/5">
                    <td className="px-4 py-3 font-medium text-slate-100">{t.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{t.slug}</td>
                    <td className="px-4 py-3 text-center">
                      {t.isActive
                        ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">Activa</span>
                        : <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">Cancelada</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{fmtDate(t.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
