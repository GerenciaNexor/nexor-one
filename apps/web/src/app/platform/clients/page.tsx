'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'

const MODULES = ['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA'] as const
type ModuleName = (typeof MODULES)[number]

interface Subscription { amount: number; currency: string; status: 'active' | 'cancelled' }
interface TenantRow {
  id: string; name: string; slug: string; isActive: boolean; createdAt: string
  subscription: Subscription | null
}

interface CreatedTenant {
  id: string; name: string; slug: string; isActive: boolean
  adminEmail: string; amount: number; currency: string; status: string
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtMoney(amount: number, cur?: string): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: cur || 'COP', maximumFractionDigits: 0 }).format(amount)
}

export default function PlatformClientsPage() {
  const router = useRouter()
  const [rows, setRows]       = useState<TenantRow[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [search, setSearch]   = useState('')

  // Alta de cliente
  const [showModal, setShowModal] = useState(false)
  const [created, setCreated]     = useState<CreatedTenant | null>(null)

  useEffect(() => {
    apiClient.get<{ data: TenantRow[]; total: number }>('/v1/admin/tenants?limit=100')
      .then((r) => { setRows(r.data); setTotal(r.total) })
      .catch((e: unknown) => setError((e as { message?: string }).message ?? 'Error al cargar clientes'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = rows.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.includes(search.toLowerCase()))

  function onCreated(c: CreatedTenant): void {
    setCreated(c)
    setShowModal(false)
    setRows((prev) => [
      {
        id: c.id, name: c.name, slug: c.slug, isActive: c.isActive, createdAt: new Date().toISOString(),
        subscription: { amount: c.amount, currency: c.currency, status: (c.status === 'active' ? 'active' : 'cancelled') },
      },
      ...prev,
    ])
    setTotal((n) => n + 1)
  }

  return (
    <div className="p-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-100">Clientes</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{loading ? 'Cargando…' : `${total} ${total === 1 ? 'empresa' : 'empresas'}`}</span>
          <button
            onClick={() => setShowModal(true)}
            className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500"
          >
            + Nuevo cliente
          </button>
        </div>
      </div>
      <p className="mb-4 text-sm text-slate-400">Todas las empresas de la plataforma. Abre una para ver su detalle, gestionar su suscripción o darle soporte.</p>

      {created && (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-emerald-200">Cliente <span className="text-emerald-100">{created.name}</span> creado.</p>
              <p className="mt-1 text-emerald-300/90">
                Admin: <span className="font-mono text-emerald-100">{created.adminEmail}</span>. Recuerda compartirle la contraseña que definiste — no volverá a mostrarse.
              </p>
            </div>
            <button onClick={() => setCreated(null)} className="shrink-0 rounded-lg border border-emerald-500/30 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20">Cerrar</button>
          </div>
        </div>
      )}

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
                <th className="px-4 py-3">Monto/mes</th>
                <th className="px-4 py-3">Creado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-14 text-center text-sm text-slate-500">Cargando…</td></tr>
              ) : error ? (
                <tr><td colSpan={5} className="py-14 text-center text-sm text-red-400">{error}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="py-14 text-center text-sm text-slate-500">Sin clientes</td></tr>
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
                    <td className="px-4 py-3 text-slate-300">
                      {t.subscription && t.subscription.amount > 0
                        ? fmtMoney(t.subscription.amount, t.subscription.currency)
                        : <span className="text-slate-500">Sin definir</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{fmtDate(t.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && <NewClientModal onClose={() => setShowModal(false)} onCreated={onCreated} />}
    </div>
  )
}

// ─── Modal de alta ──────────────────────────────────────────────────────────────

function NewClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: CreatedTenant) => void }) {
  const [name, setName]                 = useState('')
  const [slug, setSlug]                 = useState('')
  const [taxId, setTaxId]               = useState('')
  const [currency, setCurrency]         = useState('COP')
  const [adminName, setAdminName]       = useState('')
  const [adminEmail, setAdminEmail]     = useState('')
  const [adminPassword, setAdminPass]   = useState('')
  const [modules, setModules]           = useState<ModuleName[]>([...MODULES])
  const [amount, setAmount]             = useState('')
  const [reason, setReason]             = useState('')

  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  function toggleModule(m: ModuleName): void {
    setModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
  }

  async function submit(): Promise<void> {
    setErr(null)
    if (!name.trim())          { setErr('El nombre de la empresa es obligatorio.'); return }
    if (!adminName.trim())     { setErr('El nombre del administrador es obligatorio.'); return }
    if (!adminEmail.trim())    { setErr('El email del administrador es obligatorio.'); return }
    if (adminPassword.length < 8) { setErr('La contraseña debe tener al menos 8 caracteres.'); return }
    if (!reason.trim())        { setErr('El motivo es obligatorio.'); return }

    const body: {
      name: string; slug?: string; taxId?: string; currency?: string
      adminName: string; adminEmail: string; adminPassword: string
      modules?: ModuleName[]; amount?: number; reason: string
    } = {
      name: name.trim(),
      adminName: adminName.trim(),
      adminEmail: adminEmail.trim(),
      adminPassword,
      currency: currency.trim() || 'COP',
      modules,
      reason: reason.trim(),
    }
    if (slug.trim())  body.slug = slug.trim()
    if (taxId.trim()) body.taxId = taxId.trim()
    if (amount.trim()) body.amount = Number(amount)

    setSaving(true)
    try {
      const res = await apiClient.post<{ success: true; data: CreatedTenant }>('/v1/admin/tenants', body)
      onCreated(res.data)
    } catch (e: unknown) {
      const err2 = e as { message?: string; code?: string }
      setErr(err2.message ?? 'No se pudo crear el cliente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#12162a] p-6 text-slate-200 shadow-2xl">
        <div className="max-h-[80vh] overflow-y-auto pr-1">
          <h3 className="text-lg font-semibold text-slate-100">Nuevo cliente</h3>
          <p className="mt-1 text-sm text-slate-400">Crea la empresa, su usuario administrador y su suscripción.</p>

          {/* Empresa */}
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Empresa</h4>
          <div className="mt-2 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400">Nombre <span className="text-red-400">*</span></label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/60" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">Slug</label>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="opcional"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/60" />
              <p className="mt-1 text-xs text-slate-500">Se genera del nombre si lo dejas vacío.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400">NIT</label>
                <input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="opcional"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/60" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400">Moneda</label>
                <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/60" />
              </div>
            </div>
          </div>

          {/* Administrador */}
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Administrador</h4>
          <div className="mt-2 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400">Nombre <span className="text-red-400">*</span></label>
              <input value={adminName} onChange={(e) => setAdminName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/60" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">Email <span className="text-red-400">*</span></label>
              <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/60" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">Contraseña <span className="text-red-400">*</span></label>
              <input type="text" value={adminPassword} onChange={(e) => setAdminPass(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/60" />
              <p className="mt-1 text-xs text-slate-500">Mínimo 8 caracteres. Compártela con el cliente: no se vuelve a mostrar.</p>
            </div>
          </div>

          {/* Módulos */}
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Módulos</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {MODULES.map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300">
                <input type="checkbox" checked={modules.includes(m)} onChange={() => toggleModule(m)} className="h-4 w-4 accent-violet-500" />
                {m}
              </label>
            ))}
          </div>

          {/* Suscripción */}
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Suscripción</h4>
          <div className="mt-2 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400">Monto mensual</label>
              <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/60" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">Motivo <span className="text-red-400">*</span></label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500}
                placeholder="Ej.: alta de nuevo cliente (queda auditado)…"
                className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/60" />
            </div>
          </div>

          {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-white/10 pt-4">
          <button onClick={onClose} disabled={saving}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50">Cancelar</button>
          <button onClick={submit} disabled={saving}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
            {saving ? 'Creando…' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}
