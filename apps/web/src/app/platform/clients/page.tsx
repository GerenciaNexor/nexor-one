'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'

const MODULES = ['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA'] as const
type ModuleName = (typeof MODULES)[number]

interface Subscription { amount: number; currency: string; status: 'active' | 'cancelled' }
// HU-142 — estado de demo derivado en el backend
interface DemoState {
  isDemo: boolean
  status: 'active' | 'expired' | null
  daysRemaining: number | null
  startedAt: string | null
  endedAt: string | null
}
interface TenantRow {
  id: string; name: string; slug: string; isActive: boolean; createdAt: string
  subscription: Subscription | null
  demo: DemoState
}

interface CreatedTenant {
  id: string; name: string; slug: string; isActive: boolean
  adminEmail: string; amount: number; currency: string; status: string | null
  demo: DemoState
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
        subscription: c.demo.isDemo ? null : { amount: c.amount, currency: c.currency, status: (c.status === 'active' ? 'active' : 'cancelled') },
        demo: c.demo,
      },
      ...prev,
    ])
    setTotal((n) => n + 1)
  }

  return (
    <div className="p-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Clientes</h1>
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
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Todas las empresas de la plataforma. Abre una para ver su detalle, gestionar su suscripción o darle soporte.</p>

      {created && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-emerald-700 dark:text-emerald-200">Cliente <span className="text-emerald-800 dark:text-emerald-100">{created.name}</span> creado.</p>
              <p className="mt-1 text-emerald-700 dark:text-emerald-300/90">
                Admin: <span className="font-mono text-emerald-800 dark:text-emerald-100">{created.adminEmail}</span>. Recuerda compartirle la contraseña que definiste — no volverá a mostrarse.
              </p>
            </div>
            <button onClick={() => setCreated(null)} className="shrink-0 rounded-lg border border-emerald-200 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:text-emerald-200 dark:hover:bg-emerald-500/20">Cerrar</button>
          </div>
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nombre o slug…"
        className="mb-4 w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-violet-500/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
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
                <tr><td colSpan={5} className="py-14 text-center text-sm text-red-600 dark:text-red-400">{error}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="py-14 text-center text-sm text-slate-500">Sin clientes</td></tr>
              ) : (
                filtered.map((t) => (
                  <tr key={t.id} onClick={() => router.push(`/platform/clients/${t.id}`)}
                    className="cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{t.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{t.slug}</td>
                    <td className="px-4 py-3 text-center">
                      {t.demo.isDemo
                        ? (t.demo.status === 'active'
                            ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" title={t.demo.endedAt ? `Vence ${fmtDate(t.demo.endedAt)}` : undefined}>Demo · {t.demo.daysRemaining}d</span>
                            : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Demo vencida</span>)
                        : (t.isActive
                            ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Activa</span>
                            : <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">Cancelada</span>)}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {t.demo.isDemo
                        ? <span className="text-slate-500">Demo</span>
                        : t.subscription && t.subscription.amount > 0
                          ? fmtMoney(t.subscription.amount, t.subscription.currency)
                          : <span className="text-slate-500">Sin definir</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{fmtDate(t.createdAt)}</td>
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
  // HU-142 — modo demo
  const [isDemo, setIsDemo]             = useState(false)
  const [demoDays, setDemoDays]         = useState('15')

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
    if (isDemo && !taxId.trim()) { setErr('El NIT es obligatorio para crear una demo (control anti-duplicado).'); return }
    if (!reason.trim())        { setErr('El motivo es obligatorio.'); return }

    const body: {
      name: string; slug?: string; taxId?: string; currency?: string
      adminName: string; adminEmail: string; adminPassword: string
      modules?: ModuleName[]; amount?: number; reason: string
      isDemo?: boolean; demoDurationDays?: number
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
    // HU-142 — demo: sin monto de suscripción; se envía la duración (el backend acota a 1..30)
    if (isDemo) {
      body.isDemo = true
      body.demoDurationDays = Math.min(30, Math.max(1, Number(demoDays) || 15))
    } else if (amount.trim()) {
      body.amount = Number(amount)
    }

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
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-slate-700 shadow-2xl dark:border-white/10 dark:bg-[#12162a] dark:text-slate-200">
        <div className="max-h-[80vh] overflow-y-auto pr-1">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nuevo cliente</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Crea la empresa, su usuario administrador y su suscripción.</p>

          {/* Empresa */}
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Empresa</h4>
          <div className="mt-2 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Nombre <span className="text-red-600 dark:text-red-400">*</span></label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-500/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Slug</label>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="opcional"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-500/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100" />
              <p className="mt-1 text-xs text-slate-500">Se genera del nombre si lo dejas vacío.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">NIT</label>
                <input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="opcional"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-500/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Moneda</label>
                <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-500/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100" />
              </div>
            </div>
          </div>

          {/* Administrador */}
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Administrador</h4>
          <div className="mt-2 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Nombre <span className="text-red-600 dark:text-red-400">*</span></label>
              <input value={adminName} onChange={(e) => setAdminName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-500/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Email <span className="text-red-600 dark:text-red-400">*</span></label>
              <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-500/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Contraseña <span className="text-red-600 dark:text-red-400">*</span></label>
              <input type="text" value={adminPassword} onChange={(e) => setAdminPass(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-500/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100" />
              <p className="mt-1 text-xs text-slate-500">Mínimo 8 caracteres. Compártela con el cliente: no se vuelve a mostrar.</p>
            </div>
          </div>

          {/* Módulos */}
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Módulos</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {MODULES.map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                <input type="checkbox" checked={modules.includes(m)} onChange={() => toggleModule(m)} className="h-4 w-4 accent-violet-500" />
                {m}
              </label>
            ))}
          </div>

          {/* Modo demo (HU-142) */}
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Modo demo</h4>
          <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            <input type="checkbox" checked={isDemo} onChange={(e) => setIsDemo(e.target.checked)} className="mt-0.5 h-4 w-4 accent-violet-500" />
            <span>
              Crear como <span className="font-semibold text-violet-700 dark:text-violet-300">demo</span> con expiración.
              <span className="mt-0.5 block text-xs text-slate-500">Al vencer se suspende automáticamente (acceso bloqueado) sin borrar datos.</span>
            </span>
          </label>
          {isDemo && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Duración (días)</label>
              <input type="number" min={1} max={30} value={demoDays} onChange={(e) => setDemoDays(e.target.value)} placeholder="15"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-500/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100" />
              <p className="mt-1 text-xs text-slate-500">Por defecto 15 días, máximo 30. Editable después desde el detalle.</p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">El <strong>NIT es obligatorio</strong>: se usa para bloquear demos repetidas (una empresa que ya tuvo demo o fue cliente no recibe otra).</p>
            </div>
          )}

          {/* Suscripción (solo para clientes de pago; una demo no lleva suscripción) */}
          {!isDemo && (<>
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Suscripción</h4>
          <div className="mt-2 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Monto mensual</label>
              <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-500/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100" />
            </div>
          </div>
          </>)}

          {/* Motivo (obligatorio, auditado) */}
          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Motivo <span className="text-red-600 dark:text-red-400">*</span></label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500}
                placeholder="Ej.: alta de nuevo cliente (queda auditado)…"
                className="mt-1 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-500/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100" />
            </div>
          </div>

          {err && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{err}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
          <button onClick={onClose} disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancelar</button>
          <button onClick={submit} disabled={saving}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
            {saving ? 'Creando…' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}
