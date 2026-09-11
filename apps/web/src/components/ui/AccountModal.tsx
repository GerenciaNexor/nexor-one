'use client'

import { useState } from 'react'
import { Portal } from '@/components/ui/Portal'
import { ChangePasswordModal } from '@/components/ui/ChangePasswordModal'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import type { LoginUser } from '@/lib/auth-api'

// Etiquetas legibles de rol y módulo (no mostramos los códigos internos al usuario).
const ROLE_LABEL: Record<string, string> = {
  TENANT_ADMIN: 'Administrador de empresa',
  BRANCH_ADMIN: 'Administrador de sucursal',
  AREA_MANAGER: 'Jefe de área',
  OPERATIVE:    'Operativo',
  SUPER_ADMIN:  'Super Admin',
}

const MODULE_LABEL: Record<string, string> = {
  ARI: 'Ventas', NIRA: 'Compras', KIRA: 'Inventario', AGENDA: 'Agenda', VERA: 'Finanzas',
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '·'
}

/**
 * Modal "Mi cuenta": muestra la información básica del usuario autenticado y,
 * desde aquí, permite cambiar la propia contraseña. Disponible para CUALQUIER rol.
 */
export function AccountModal({ user, onClose }: { user: LoginUser; onClose: () => void }) {
  const [pwOpen, setPwOpen] = useState(false)
  const patchUser = useAuthStore((s) => s.patchUser)

  // HU-208 — teléfono/WhatsApp editable; HU-209 — consentimiento de notificaciones por WhatsApp.
  const [phone, setPhone]   = useState(user.phone ?? '')
  const [optIn, setOptIn]   = useState(user.whatsappOptIn ?? true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')
  const dirty = (phone.trim() || '') !== (user.phone ?? '') || optIn !== (user.whatsappOptIn ?? true)

  async function savePrefs() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const body = { phone: phone.trim() || null, whatsappOptIn: optIn }
      await apiClient.put('/v1/users/me', body)
      patchUser(body)
      setSaved(true)
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  const rows: { label: string; value: string }[] = [
    { label: 'Nombre',  value: user.name },
    { label: 'Correo',  value: user.email },
    { label: 'Rol',     value: ROLE_LABEL[user.role] ?? user.role },
    ...(user.module ? [{ label: 'Área', value: MODULE_LABEL[user.module] ?? user.module }] : []),
    { label: 'Empresa', value: user.tenant.name },
  ]

  return (
    <>
      <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Mi cuenta</h2>
              <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {/* Encabezado con avatar */}
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white">
                {initials(user.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{user.name}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{ROLE_LABEL[user.role] ?? user.role}</p>
              </div>
            </div>

            {/* Información básica */}
            <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{r.label}</dt>
                  <dd className="truncate text-sm text-slate-900 dark:text-slate-100">{r.value}</dd>
                </div>
              ))}
            </dl>

            {/* HU-208/209 — teléfono/WhatsApp para recordatorios + consentimiento */}
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Número de WhatsApp para notificaciones</label>
              <input
                type="tel" value={phone}
                onChange={(e) => { setPhone(e.target.value); setSaved(false) }}
                placeholder="+57 300 000 0000"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              {/* HU-209 — consentimiento (opt-in). Si se desactiva, no se envían WhatsApp; el aviso interno se mantiene. */}
              <label className="mt-3 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox" checked={optIn}
                  onChange={(e) => { setOptIn(e.target.checked); setSaved(false) }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Quiero recibir notificaciones por WhatsApp (recordatorios y confirmaciones). Siempre verás los avisos dentro de la app.</span>
              </label>
              <div className="mt-2 flex items-center justify-end gap-2">
                {error && <p className="mr-auto text-xs text-red-500">{error}</p>}
                {saved && !dirty && <p className="mr-auto text-xs text-emerald-600 dark:text-emerald-400">Preferencias guardadas ✓</p>}
                <button
                  onClick={() => void savePrefs()}
                  disabled={saving || !dirty}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
                >
                  {saving ? '…' : 'Guardar'}
                </button>
              </div>
            </div>

            {/* Acciones */}
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setPwOpen(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Cambiar contraseña
              </button>
            </div>
          </div>
        </div>
      </Portal>

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </>
  )
}
