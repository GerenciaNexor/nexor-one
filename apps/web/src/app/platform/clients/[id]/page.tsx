'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import type { LoginUser } from '@/lib/auth-api'

// ─── Tipos ────────────────────────────────────────────────────────────────────

const MODULES = ['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA'] as const
type ModuleName = (typeof MODULES)[number]

interface TenantDetail {
  id: string; name: string; slug: string; legalName: string | null; taxId: string | null
  isActive: boolean; timezone: string; currency: string; createdAt: string
  branches: { id: string; name: string; city: string | null; isActive: boolean }[]
  users:    { id: string; name: string; email: string; role: string; module: string | null; isActive: boolean; lastLoginAt: string | null }[]
  featureFlags: Record<string, boolean>
  subscription: { amount: number; currency: string; status: string; startedAt: string | null; cancelledAt: string | null } | null
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtMoney(amount: number, cur?: string): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: cur || 'COP', maximumFractionDigits: 0 }).format(amount)
}

// ─── Prompt de motivo (acciones sensibles) ──────────────────────────────────────

function ReasonModal({ title, confirmLabel, onConfirm, onCancel, danger }: {
  title: string; confirmLabel: string; danger?: boolean
  onConfirm: (reason: string) => void; onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12162a] p-6 text-slate-200 shadow-2xl">
        <h3 className="text-base font-semibold text-slate-100">{title}</h3>
        <label className="mt-4 block text-xs font-medium text-slate-400">Motivo (obligatorio)</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500}
          placeholder="Ej.: solicitud del cliente, falta de pago, activación del piloto…"
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/60" />
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5">Cancelar</button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={!reason.trim()}
            className={`rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${danger ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function PlatformClientDetailPage() {
  const params = useParams<{ id: string }>()
  const id     = params.id
  const router = useRouter()

  const platformAdmin      = useAuthStore((s) => s.platformAdmin)
  const startImpersonation = useAuthStore((s) => s.startImpersonation)

  const [t, setT]           = useState<TenantDetail | null>(null)
  const [loading, setLoad]  = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [busy, setBusy]     = useState(false)
  const [reasonModal, setReasonModal] = useState<null | 'activate' | 'deactivate'>(null)
  const [amountModal, setAmountModal] = useState(false)

  function load(): void {
    apiClient.get<TenantDetail>(`/v1/admin/tenants/${id}`)
      .then(setT)
      .catch((e: unknown) => setError((e as { message?: string }).message ?? 'Error al cargar la empresa'))
      .finally(() => setLoad(false))
  }
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleModule(mod: ModuleName): Promise<void> {
    if (!t) return
    const enabled = !t.featureFlags[mod]
    setT({ ...t, featureFlags: { ...t.featureFlags, [mod]: enabled } }) // optimista
    try {
      await apiClient.put(`/v1/admin/tenants/${id}/feature-flags/${mod}`, { enabled })
    } catch {
      setT({ ...t, featureFlags: { ...t.featureFlags, [mod]: !enabled } }) // revertir
      alert('No se pudo cambiar el módulo')
    }
  }

  async function confirmToggleSubscription(reason: string): Promise<void> {
    if (!t) return
    const isActive = reasonModal === 'activate'
    setReasonModal(null)
    setBusy(true)
    try {
      await apiClient.put(`/v1/admin/tenants/${id}/toggle`, { isActive, reason })
      setT({ ...t, isActive })
    } catch (e: unknown) {
      alert((e as { message?: string }).message ?? 'No se pudo cambiar la suscripción')
    } finally { setBusy(false) }
  }

  function onAmountUpdated(sub: { amount: number; currency: string; status: string }): void {
    if (!t) return
    setT({
      ...t,
      subscription: {
        amount: sub.amount,
        currency: sub.currency,
        status: sub.status,
        startedAt: t.subscription?.startedAt ?? null,
        cancelledAt: t.subscription?.cancelledAt ?? null,
      },
    })
    setAmountModal(false)
  }

  async function impersonate(): Promise<void> {
    if (!t) return
    setBusy(true)
    try {
      const res = await apiClient.post<{ token: string }>(`/v1/admin/tenants/${id}/impersonate`, {})
      const syntheticUser: LoginUser = {
        id:       t.id,
        email:    platformAdmin?.email ?? 'soporte@nexor-one.com',
        name:     'Soporte NEXOR',
        role:     'TENANT_ADMIN',
        module:   null,
        tenantId: t.id,
        branchId: null,
        tenant:   { id: t.id, name: t.name, slug: t.slug },
      }
      startImpersonation(res.token, syntheticUser, t.name)
      router.push('/dashboard')
    } catch (e: unknown) {
      alert((e as { message?: string }).message ?? 'No se pudo impersonar')
      setBusy(false)
    }
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Cargando…</div>
  if (error || !t) return (
    <div className="p-6">
      <Link href="/platform/clients" className="text-sm text-violet-300 hover:underline">← Clientes</Link>
      <p className="mt-4 text-sm text-red-400">{error ?? 'No encontrado'}</p>
    </div>
  )

  return (
    <div className="p-6">
      <Link href="/platform/clients" className="text-sm text-violet-300 hover:underline">← Clientes</Link>

      {/* Encabezado + acciones */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-100">{t.name}</h1>
            {t.isActive
              ? <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">Suscripción activa</span>
              : <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold text-red-300">Cancelada</span>}
          </div>
          <p className="mt-1 font-mono text-xs text-slate-500">{t.slug}{t.taxId ? ` · NIT ${t.taxId}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={impersonate} disabled={busy}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
            👁️ Impersonar (soporte)
          </button>
          {t.isActive
            ? <button onClick={() => setReasonModal('deactivate')} disabled={busy}
                className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50">Cancelar suscripción</button>
            : <button onClick={() => setReasonModal('activate')} disabled={busy}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">Activar suscripción</button>}
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {/* Info */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Datos de la empresa</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Razón social</dt><dd className="text-slate-300">{t.legalName ?? '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">NIT</dt><dd className="text-slate-300">{t.taxId ?? '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Moneda</dt><dd className="text-slate-300">{t.currency}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Zona horaria</dt><dd className="text-slate-300">{t.timezone}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Sucursales</dt><dd className="text-slate-300">{t.branches.length}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Usuarios</dt><dd className="text-slate-300">{t.users.length}</dd></div>
          </dl>
        </div>

        {/* Suscripción */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Suscripción</h2>
            <button onClick={() => setAmountModal(true)}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-white/10">
              Editar monto
            </button>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Estado</dt>
              <dd>
                {(t.subscription ? t.subscription.status === 'active' : t.isActive)
                  ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">Activa</span>
                  : <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">Cancelada</span>}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Monto mensual</dt>
              <dd className="text-slate-300">
                {t.subscription && t.subscription.amount > 0
                  ? fmtMoney(t.subscription.amount, t.subscription.currency)
                  : 'Sin definir'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Desde</dt>
              <dd className="text-slate-300">{t.subscription?.startedAt ? fmtDate(t.subscription.startedAt) : '—'}</dd>
            </div>
          </dl>
        </div>

        {/* Módulos */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Módulos activos</h2>
          <div className="space-y-2">
            {MODULES.map((m) => (
              <label key={m} className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/5">
                <span className="text-sm text-slate-300">{m}</span>
                <input type="checkbox" checked={!!t.featureFlags[m]} onChange={() => toggleModule(m)}
                  className="h-4 w-4 accent-violet-500" />
              </label>
            ))}
          </div>
        </div>

        {/* Usuarios */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Usuarios del cliente</h2>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {t.users.length === 0 ? <p className="text-xs text-slate-500">Sin usuarios</p> : t.users.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2 border-b border-white/5 pb-1.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-200">{u.name}</p>
                  <p className="truncate text-xs text-slate-500">{u.email}</p>
                </div>
                <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">{u.role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {reasonModal && (
        <ReasonModal
          title={reasonModal === 'activate' ? `Activar la suscripción de ${t.name}` : `Cancelar la suscripción de ${t.name}`}
          confirmLabel={reasonModal === 'activate' ? 'Activar' : 'Cancelar suscripción'}
          danger={reasonModal === 'deactivate'}
          onConfirm={confirmToggleSubscription}
          onCancel={() => setReasonModal(null)}
        />
      )}

      {amountModal && (
        <AmountModal
          tenantId={t.id}
          tenantName={t.name}
          initialAmount={t.subscription?.amount ?? 0}
          onUpdated={onAmountUpdated}
          onCancel={() => setAmountModal(false)}
        />
      )}
    </div>
  )
}

// ─── Modal editar monto ─────────────────────────────────────────────────────────

function AmountModal({ tenantId, tenantName, initialAmount, onUpdated, onCancel }: {
  tenantId: string; tenantName: string; initialAmount: number
  onUpdated: (sub: { amount: number; currency: string; status: string }) => void
  onCancel: () => void
}) {
  const [amount, setAmount] = useState(initialAmount ? String(initialAmount) : '')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  async function submit(): Promise<void> {
    setErr(null)
    const num = Number(amount)
    if (amount.trim() === '' || Number.isNaN(num) || num < 0) { setErr('Ingresa un monto válido.'); return }
    if (!reason.trim()) { setErr('El motivo es obligatorio.'); return }
    setSaving(true)
    try {
      const res = await apiClient.put<{ success: true; data: { amount: number; currency: string; status: string } }>(
        `/v1/admin/tenants/${tenantId}/subscription`,
        { amount: num, reason: reason.trim() },
      )
      onUpdated(res.data)
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo actualizar el monto.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12162a] p-6 text-slate-200 shadow-2xl">
        <h3 className="text-base font-semibold text-slate-100">Editar monto mensual de {tenantName}</h3>

        <label className="mt-4 block text-xs font-medium text-slate-400">Monto mensual</label>
        <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/60" />

        <label className="mt-4 block text-xs font-medium text-slate-400">Motivo (obligatorio)</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500}
          placeholder="Ej.: ajuste de plan, renegociación…"
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/60" />

        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} disabled={saving}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50">Cancelar</button>
          <button onClick={submit} disabled={saving}
            className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar monto'}
          </button>
        </div>
      </div>
    </div>
  )
}
