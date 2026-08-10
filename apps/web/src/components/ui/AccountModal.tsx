'use client'

import { useState } from 'react'
import { Portal } from '@/components/ui/Portal'
import { ChangePasswordModal } from '@/components/ui/ChangePasswordModal'
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
